import { wallV1 as Wall } from "../../models/wall/WallV1";
import { sectionV1 as Section } from "../../models/section/SectionV1";
import { stackV1 as Stack } from "../../models/stack/StackV1";
import { rowV1 as Row } from "../../models/row/RowV1";
import { brickV1 as Brick } from "../../models/brick/BrickV1";
import { placementV2 as Placement } from "../../models/placement/PlacementV2";
import {
  findFirst,
  findMany,
  upgradeAggregateContractVersion,
} from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { pageV3 as Page } from "../../models/page/PageV3";
import { pageSnapshotV2 as PageSnapshot } from "../../models/pageSnapshot/PageSnapshotV2";
import { siteV3 as Site } from "../../models/site/SiteV3";
import { userV1 as User } from "../../models/user/UserV1";
import { makePageSnapshot } from "../../snapshots/makePageSnapshot";
import { publishSiteV2 } from "./PublishSiteV2";

export const publishSiteV3 = upgradeAggregateContractVersion(publishSiteV2, {
  version: "3.0.0",
  up: Effect.fn("publishSiteV3.up")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  models: {
    wall: Wall,
    section: Section,
    stack: Stack,
    row: Row,
    brick: Brick,
    placement: Placement,
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
  payload: {},
  guard: Effect.fn("publishSite.guard")(function* (props) {
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
      if (page === undefined) {
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
  program: Effect.fn("publishSite")(function* (props) {
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
      const bricks = yield* findMany({ db, model: Brick, where: { pageId: { eq: page.id } } });
      const walls = yield* findMany({ db, model: Wall, where: { pageId: { eq: page.id } } });
      const sections = yield* findMany({
        db,
        model: Section,
        where: { wall: { pageId: { eq: page.id } } },
      });
      const stacks = yield* findMany({
        db,
        model: Stack,
        where: { section: { wall: { pageId: { eq: page.id } } } },
      });
      const rows = yield* findMany({
        db,
        model: Row,
        where: { stack: { section: { wall: { pageId: { eq: page.id } } } } },
      });
      const placements = yield* findMany({
        db,
        model: Placement,
        where: { brick: { pageId: { eq: page.id } } },
      });
      yield* operations.createPageSnapshot({
        resourceId: selection.snapshotId,
        attributes: {
          pageId: page.id,
          content: makePageSnapshot({ page, bricks, walls, sections, stacks, rows, placements }),
        },
      });
      yield* operations.updatePage({
        resourceId: page.id,
        attributes: { isPublished: true, publishedSnapshotId: selection.snapshotId },
      });
    }
    yield* operations.updateSite({ resourceId: payload.siteId, attributes: { isPublished: true } });
  }),
});
