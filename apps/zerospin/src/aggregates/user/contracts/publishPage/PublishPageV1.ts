import { libraryModule } from "@qrk.sh/library/libraryModule";
import {
  ContractError,
  findFirst,
  findMany,
  makeAggregateContractVersion,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { pageV2 as Page } from "../../models/page/PageV2";
import { pageSnapshotV1 as PageSnapshot } from "../../models/pageSnapshot/PageSnapshotV1";
import { siteV2 as Site } from "../../models/site/SiteV2";
import { userV1 as User } from "../../models/user/UserV1";
import { makePageSnapshot } from "../../snapshots/makePageSnapshot";
import { publishPage } from "./publishPage";

export const publishPageV1 = makeAggregateContractVersion(publishPage, {
  version: "1.0.0",
  payload: {
    pageId: primitives.foreignKey({ abbreviation: Page.abbreviation }),
    snapshotId: primitives.foreignKey({ abbreviation: PageSnapshot.abbreviation }),
  },
  models: {
    ...libraryModule.models,
    page: Page,
    pageSnapshot: PageSnapshot,
    site: Site,
    user: User,
  },
  operations: {
    createPageSnapshot: PageSnapshot.operations.create,
    updatePage: Page.operations.update,
  },
  failures: {
    publishPageUserMismatch: ContractError.schema({ code: "publish-page-user-mismatch" }),
    publishPageNotFound: ContractError.schema({ code: "publish-page-not-found" }),
    publishPageUnavailable: ContractError.schema({ code: "publish-page-unavailable" }),
  },
  guard: Effect.fn("publishPage.guard")(function* (props) {
    const { payload, claims, failures, db } = props;
    const clerkUserId = claims?.clerkUserId;
    if (typeof clerkUserId !== "string") {
      return yield* failures.publishPageUserMismatch.make({
        message: "Publishing requires an authenticated user",
        status: 403,
      });
    }
    const page = yield* findFirst({ db, model: Page, where: { id: { eq: payload.pageId } } });
    if (page === undefined || page.siteId === null) {
      return yield* failures.publishPageNotFound.make({
        message: `Page ${payload.pageId} was not found`,
        status: 404,
      });
    }
    const site = yield* findFirst({ db, model: Site, where: { id: { eq: page.siteId } } });
    if (site === undefined) {
      return yield* failures.publishPageNotFound.make({
        message: `Site ${page.siteId} was not found`,
        status: 404,
      });
    }
    const user =
      site.userId === null
        ? undefined
        : yield* findFirst({ db, model: User, where: { id: { eq: site.userId } } });
    if (user === undefined || user.clerkUserId !== clerkUserId) {
      return yield* failures.publishPageUserMismatch.make({
        message: `Page ${page.id} does not belong to identity ${clerkUserId}`,
        status: 403,
      });
    }
    if (!site.isPublished || page.isPublished !== false || page.wallId === null) {
      return yield* failures.publishPageUnavailable.make({
        message: "Publishing a page requires an unpublished page in a published site",
        status: 409,
      });
    }
  }),
  program: Effect.fn("publishPage")(function* (props) {
    const { payload, operations, failures, db } = props;
    const page = yield* findFirst({ db, model: Page, where: { id: { eq: payload.pageId } } });
    if (page === undefined || page.wallId === null) {
      return yield* failures.publishPageNotFound.make({
        message: `Page ${payload.pageId} was not found`,
        status: 404,
      });
    }
    const bricks = yield* findMany({
      db,
      model: libraryModule.models.brick,
      where: { wallId: { eq: page.wallId } },
    });
    const placements = yield* findMany({
      db,
      model: libraryModule.models.placement,
      where: { brick: { wallId: { eq: page.wallId } } },
    });
    yield* operations.createPageSnapshot({
      resourceId: payload.snapshotId,
      attributes: { pageId: page.id, content: makePageSnapshot({ page, bricks, placements }) },
    });
    yield* operations.updatePage({
      resourceId: page.id,
      attributes: { isPublished: true, publishedSnapshotId: payload.snapshotId },
    });
  }),
});
