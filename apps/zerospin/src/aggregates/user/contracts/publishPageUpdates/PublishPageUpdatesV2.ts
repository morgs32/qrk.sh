import { libraryModule } from "@qrk.sh/library/libraryModule";
import { findFirst, findMany, upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { pageV3 as Page } from "../../models/page/PageV3";
import { pageSnapshotV2 as PageSnapshot } from "../../models/pageSnapshot/PageSnapshotV2";
import { siteV3 as Site } from "../../models/site/SiteV3";
import { userV1 as User } from "../../models/user/UserV1";
import { makePageSnapshot } from "../../snapshots/makePageSnapshot";
import { publishPageUpdatesV1 } from "./PublishPageUpdatesV1";

export const publishPageUpdatesV2 = upgradeAggregateContractVersion(publishPageUpdatesV1, {
  version: "2.0.0",
  payload: {},
  up: Effect.fn("publishPageUpdatesV2.up")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  down: Effect.fn("publishPageUpdatesV2.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
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
  guard: Effect.fn("publishPageUpdatesV2.guard")(function* (props) {
    const { payload, claims, failures, db } = props;
    const clerkUserId = claims?.clerkUserId;
    if (typeof clerkUserId !== "string") {
      return yield* failures.publishPageUpdatesUserMismatch.make({
        message: "Publishing requires an authenticated user",
        status: 403,
      });
    }
    const page = yield* findFirst({ db, model: Page, where: { id: { eq: payload.pageId } } });
    if (page === undefined || page.siteId === null) {
      return yield* failures.publishPageUpdatesNotFound.make({
        message: `Page ${payload.pageId} was not found`,
        status: 404,
      });
    }
    const site = yield* findFirst({ db, model: Site, where: { id: { eq: page.siteId } } });
    if (site === undefined) {
      return yield* failures.publishPageUpdatesNotFound.make({
        message: `Site ${page.siteId} was not found`,
        status: 404,
      });
    }
    const user =
      site.userId === null
        ? undefined
        : yield* findFirst({ db, model: User, where: { id: { eq: site.userId } } });
    if (user === undefined || user.clerkUserId !== clerkUserId) {
      return yield* failures.publishPageUpdatesUserMismatch.make({
        message: `Page ${page.id} does not belong to identity ${clerkUserId}`,
        status: 403,
      });
    }
    if (!site.isPublished || page.isPublished !== true || page.wallId === null) {
      return yield* failures.publishPageUpdatesUnavailable.make({
        message: "Publish updates requires a published page in a published site",
        status: 409,
      });
    }
  }),
  program: Effect.fn("publishPageUpdatesV2")(function* (props) {
    const { payload, operations, failures, db } = props;
    const page = yield* findFirst({ db, model: Page, where: { id: { eq: payload.pageId } } });
    if (page === undefined || page.wallId === null) {
      return yield* failures.publishPageUpdatesNotFound.make({
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
