import { defineAggregateContract } from "@zerospin/sdk/browser";
import { page as pageIdentity } from "@qrk.sh/bricks/zerospin/models/page/page";

import { pageSnapshot as pageSnapshotIdentity } from "@qrk.sh/bricks/zerospin/models/pageSnapshot/pageSnapshot";

import { wallV1 as Wall } from "@qrk.sh/bricks/zerospin/models/wall/WallV1";

import { brickV1 as Brick } from "@qrk.sh/bricks/zerospin/models/brick/BrickV1";

import { placementV1 as Placement } from "@qrk.sh/bricks/zerospin/models/placement/PlacementV1";

import {
  modelId,
  ContractError,
  findFirst,
  findMany,
  makeAggregateContractRelease,
  primitives,
} from "@zerospin/sdk/browser";

import { Effect } from "effect";

import { pageV1 as Page } from "@qrk.sh/bricks/zerospin/models/page/PageV1";

import { pageSnapshotV1 as PageSnapshot } from "@qrk.sh/bricks/zerospin/models/pageSnapshot/PageSnapshotV1";

import { siteV1 as Site } from "@qrk.sh/bricks/zerospin/models/site/SiteV1";

import { userV1 as User } from "@qrk.sh/bricks/zerospin/models/user/UserV1";

import { makePageSnapshotV1 } from "../makePageSnapshotV1";

const publishPage = defineAggregateContract("publishPage");

export const publishPageV1 = makeAggregateContractRelease(publishPage, {
  version: 1,
  payload: {
    pageId: modelId({ model: pageIdentity }),
    snapshotId: modelId({ model: pageSnapshotIdentity }),
    preferredRowSizing: primitives.boolean(),
    preferredStackSizing: primitives.boolean(),
  },
  models: {
    wall: { model: Wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] },
    brick: {
      model: Brick,
      fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth"],
    },
    placement: {
      model: Placement,
      fields: ["createdAt", "updatedAt", "state", "brickId", "wallId", "layoutId", "widthWeight"],
    },
    page: {
      model: Page,
      fields: [
        "createdAt",
        "updatedAt",
        "siteId",
        "slug",
        "title",
        "description",
        "isPublished",
        "publishedSnapshotId",
      ],
    },
    pageSnapshot: { model: PageSnapshot, fields: ["createdAt", "updatedAt", "pageId", "content"] },
    site: {
      model: Site,
      fields: [
        "hostname",
        "name",
        "createdAt",
        "updatedAt",
        "slug",
        "description",
        "isPublished",
        "userId",
        "logoUrl",
        "faviconLightUrl",
        "faviconDarkUrl",
        "stickyNavbar",
        "cardStyle",
        "brickGap",
      ],
    },
    user: { model: User, fields: ["createdAt", "updatedAt", "clerkUserId", "displayName"] },
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
    if (!site.isPublished) {
      return yield* failures.publishPageUnavailable.make({
        message: "Publishing a page requires a published site",
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
    const placements = yield* findMany({
      db,
      model: db.models.placement,
      where: { wallId: { in: walls.map((entry) => entry.id) } },
    });
    yield* operations.createPageSnapshot({
      resourceId: payload.snapshotId,
      attributes: {
        pageId: page.id,
        content: makePageSnapshotV1({
          page,
          bricks,
          walls,
          placements,
          preferredRowSizing: payload.preferredRowSizing,
          preferredStackSizing: payload.preferredStackSizing,
        }),
      },
    });
    yield* operations.updatePage({
      resourceId: page.id,
      attributes: { isPublished: true, publishedSnapshotId: payload.snapshotId },
    });
  }),
});
