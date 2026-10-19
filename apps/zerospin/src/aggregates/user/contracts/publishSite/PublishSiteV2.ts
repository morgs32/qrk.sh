import { libraryModule } from "@qrk.sh/library/libraryModule";
import { findFirst, findMany, upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { pageV3 as Page } from "../../models/page/PageV3";
import { pageSnapshotV2 as PageSnapshot } from "../../models/pageSnapshot/PageSnapshotV2";
import { siteV3 as Site } from "../../models/site/SiteV3";
import { userV1 as User } from "../../models/user/UserV1";
import { makePageSnapshot } from "../../snapshots/makePageSnapshot";
import { publishSiteV1 } from "./PublishSiteV1";

export const publishSiteV2 = upgradeAggregateContractVersion(publishSiteV1, {
  version: "2.0.0",
  payload: {},
  up: Effect.fn("publishSiteV2.up")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  down: Effect.fn("publishSiteV2.down")(function* (props) {
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
    updateSite: Site.operations.update,
  },
  guard: Effect.fn("publishSiteV2.guard")(function* (props) {
    const { payload, claims, failures, db } = props;
    const clerkUserId = claims?.clerkUserId;
    if (typeof clerkUserId !== "string") {
      return yield* failures.publishSiteUserMismatch.make({
        message: "Publishing requires an authenticated user",
        status: 403,
      });
    }
    const site = yield* findFirst({ db, model: Site, where: { id: { eq: payload.siteId } } });
    if (site === undefined) {
      return yield* failures.publishSiteNotFound.make({
        message: `Site ${payload.siteId} was not found`,
        status: 404,
      });
    }
    const user =
      site.userId === null
        ? undefined
        : yield* findFirst({ db, model: User, where: { id: { eq: site.userId } } });
    if (user === undefined || user.clerkUserId !== clerkUserId) {
      return yield* failures.publishSiteUserMismatch.make({
        message: `Site ${site.id} does not belong to identity ${clerkUserId}`,
        status: 403,
      });
    }
    if (site.isPublished) {
      return yield* failures.publishSiteUnavailable.make({
        message: `Site ${site.id} is already published`,
        status: 409,
      });
    }
    if (
      new Set(payload.pages.map((page) => page.pageId)).size !== payload.pages.length ||
      new Set(payload.pages.map((page) => page.snapshotId)).size !== payload.pages.length
    ) {
      return yield* failures.publishSitePagesInvalid.make({
        message: "Selected page and snapshot IDs must be unique",
        status: 400,
      });
    }
    const sitePages = yield* findMany({ db, model: Page, where: { siteId: { eq: site.id } } });
    for (const selection of payload.pages) {
      const page = sitePages.find((page) => page.id === selection.pageId);
      if (page === undefined || page.wallId === null) {
        return yield* failures.publishSitePagesInvalid.make({
          message: `Page ${selection.pageId} does not belong to this site or has no wall`,
          status: 400,
        });
      }
    }
    const indexPages = sitePages.filter((page) => page.slug === null);
    if (
      indexPages.length !== 1 ||
      !payload.pages.some((selection) => selection.pageId === indexPages[0]?.id)
    ) {
      return yield* failures.publishSitePagesInvalid.make({
        message: "Publishing requires exactly one index page, included in the selection",
        status: 400,
      });
    }
  }),
  program: Effect.fn("publishSiteV2")(function* (props) {
    const { payload, operations, failures, db } = props;
    const sitePages = yield* findMany({
      db,
      model: Page,
      where: { siteId: { eq: payload.siteId } },
    });
    for (const page of sitePages) {
      const selection = payload.pages.find((selection) => selection.pageId === page.id);
      if (selection === undefined) {
        yield* operations.updatePage({ resourceId: page.id, attributes: { isPublished: false } });
        continue;
      }
      if (page.wallId === null) {
        return yield* failures.publishSitePagesInvalid.make({
          message: `Page ${page.id} has no wall`,
          status: 400,
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
        resourceId: selection.snapshotId,
        attributes: { pageId: page.id, content: makePageSnapshot({ page, bricks, placements }) },
      });
      yield* operations.updatePage({
        resourceId: page.id,
        attributes: { isPublished: true, publishedSnapshotId: selection.snapshotId },
      });
    }
    yield* operations.updateSite({ resourceId: payload.siteId, attributes: { isPublished: true } });
  }),
});
