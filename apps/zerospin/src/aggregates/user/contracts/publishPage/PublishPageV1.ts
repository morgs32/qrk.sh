import { page as pageIdentity } from "../../models/page/page";

import { pageSnapshot as pageSnapshotIdentity } from "../../models/pageSnapshot/pageSnapshot";

import { wallV1 as Wall } from "../../models/wall/WallV1";

import { sectionV1 as Section } from "../../models/section/SectionV1";

import { stackV1 as Stack } from "../../models/stack/StackV1";

import { rowV1 as Row } from "../../models/row/RowV1";

import { brickV1 as Brick } from "../../models/brick/BrickV1";

import { placementV1 as Placement } from "../../models/placement/PlacementV1";

import {
  modelId,
  ContractError,
  findFirst,
  findMany,
  makeAggregateContractVersion,
} from "@zerospin/sdk/browser";

import { Effect } from "effect";

import { pageV1 as Page } from "../../models/page/PageV1";

import { pageSnapshotV1 as PageSnapshot } from "../../models/pageSnapshot/PageSnapshotV1";

import { siteV1 as Site } from "../../models/site/SiteV1";

import { userV1 as User } from "../../models/user/UserV1";

import { makePageSnapshot } from "../../snapshots/makePageSnapshot";

import { publishPage } from "./publishPage";

export const publishPageV1 = makeAggregateContractVersion(publishPage, {
  version: 1,
  payload: {
    pageId: modelId({ model: pageIdentity }),
    snapshotId: modelId({ model: pageSnapshotIdentity }),
  },
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
    const page = yield* findFirst({
      db,
      model: db.models.page,
      where: { id: { eq: payload.pageId } },
    });
    if (page === undefined || page.siteId === null) {
      return yield* failures.publishPageNotFound.make({
        message: `Page ${payload.pageId} was not found`,
        status: 404,
      });
    }
    const site = yield* findFirst({
      db,
      model: db.models.site,
      where: { id: { eq: page.siteId } },
    });
    if (site === undefined) {
      return yield* failures.publishPageNotFound.make({
        message: `Site ${page.siteId} was not found`,
        status: 404,
      });
    }
    const user =
      site.userId === null
        ? undefined
        : yield* findFirst({ db, model: db.models.user, where: { id: { eq: site.userId } } });
    if (user === undefined || user.clerkUserId !== clerkUserId) {
      return yield* failures.publishPageUserMismatch.make({
        message: `Page ${page.id} does not belong to identity ${clerkUserId}`,
        status: 403,
      });
    }
    if (!site.isPublished || page.isPublished !== false) {
      return yield* failures.publishPageUnavailable.make({
        message: "Publishing a page requires an unpublished page in a published site",
        status: 409,
      });
    }
  }),
  program: Effect.fn("publishPage")(function* (props) {
    const { payload, operations, failures, db } = props;
    const page = yield* findFirst({
      db,
      model: db.models.page,
      where: { id: { eq: payload.pageId } },
    });
    if (page === undefined) {
      return yield* failures.publishPageNotFound.make({
        message: `Page ${payload.pageId} was not found`,
        status: 404,
      });
    }
    const bricks = yield* findMany({
      db,
      model: db.models.brick,
      where: { pageId: { eq: page.id } },
    });
    const walls = yield* findMany({
      db,
      model: db.models.wall,
      where: { pageId: { eq: page.id } },
    });
    const sections = yield* findMany({
      db,
      model: db.models.section,
      where: { wall: { pageId: { eq: page.id } } },
    });
    const stacks = yield* findMany({
      db,
      model: db.models.stack,
      where: { section: { wall: { pageId: { eq: page.id } } } },
    });
    const rows = yield* findMany({
      db,
      model: db.models.row,
      where: { stack: { section: { wall: { pageId: { eq: page.id } } } } },
    });
    const placements = yield* findMany({
      db,
      model: db.models.placement,
      where: { brick: { pageId: { eq: page.id } } },
    });
    yield* operations.createPageSnapshot({
      resourceId: payload.snapshotId,
      attributes: {
        pageId: page.id,
        content: makePageSnapshot({ page, bricks, walls, sections, stacks, rows, placements }),
      },
    });
    yield* operations.updatePage({
      resourceId: page.id,
      attributes: { isPublished: true, publishedSnapshotId: payload.snapshotId },
    });
  }),
});
