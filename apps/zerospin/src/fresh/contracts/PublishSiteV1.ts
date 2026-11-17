import { defineAggregateContract } from "@zerospin/sdk/browser";
import { site as siteIdentity } from "@qrk.sh/bricks/zerospin/models/site/site";

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

import { makeAbbreviationIdSchema } from "@zerospin/shapes";

import { Effect, Schema } from "effect";

import { pageV1 as Page } from "@qrk.sh/bricks/zerospin/models/page/PageV1";

import { pageSnapshotV1 as PageSnapshot } from "@qrk.sh/bricks/zerospin/models/pageSnapshot/PageSnapshotV1";

import { siteV1 as Site } from "@qrk.sh/bricks/zerospin/models/site/SiteV1";

import { userV1 as User } from "@qrk.sh/bricks/zerospin/models/user/UserV1";

import { makePageSnapshotV1 } from "../makePageSnapshotV1";

const publishSite = defineAggregateContract("publishSite");

export const publishSiteV1 = makeAggregateContractRelease(publishSite, {
  version: 1,
  payload: {
    siteId: modelId({ model: siteIdentity }),
    preferredRowSizing: primitives.boolean(),
    preferredStackSizing: primitives.boolean(),
    pages: primitives.json({
      schema: Schema.Array(
        Schema.Struct({
          pageId: makeAbbreviationIdSchema(Page.abbreviation),
          snapshotId: makeAbbreviationIdSchema(PageSnapshot.abbreviation),
        }),
      ),
    }),
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
    updateSite: Site.operations.update,
  },
  failures: {
    publishSiteUserMismatch: ContractError.schema({ code: "publish-site-user-mismatch" }),
    publishSiteNotFound: ContractError.schema({ code: "publish-site-not-found" }),
    publishSiteUnavailable: ContractError.schema({ code: "publish-site-unavailable" }),
    publishSitePagesInvalid: ContractError.schema({ code: "publish-site-pages-invalid" }),
  },
  guard: Effect.fn("publishSite.guard")(function* (props) {
    const { payload, claims, failures, db } = props;
    const clerkUserId = claims?.clerkUserId;
    if (typeof clerkUserId !== "string") {
      return yield* failures.publishSiteUserMismatch.make({
        message: "Publishing requires an authenticated user",
        status: 403,
      });
    }
    const site = yield* findFirst({
      db,
      model: db.models.site,
      where: { id: { eq: payload.siteId } },
    });
    if (site === undefined) {
      return yield* failures.publishSiteNotFound.make({
        message: `Site ${payload.siteId} was not found`,
        status: 404,
      });
    }
    const user =
      site.userId === null
        ? undefined
        : yield* findFirst({ db, model: db.models.user, where: { id: { eq: site.userId } } });
    if (user === undefined || user.clerkUserId !== clerkUserId) {
      return yield* failures.publishSiteUserMismatch.make({
        message: `Site ${site.id} does not belong to identity ${clerkUserId}`,
        status: 403,
      });
    }
    if (site.hostname === null)
      return yield* failures.publishSiteUnavailable.make({
        message: "Wait for the Site address to be assigned",
        status: 409,
      });
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
    const sitePages = yield* findMany({
      db,
      model: db.models.page,
      where: { siteId: { eq: site.id } },
    });
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
    const { payload, operations, db } = props;
    const sitePages = yield* findMany({
      db,
      model: db.models.page,
      where: { siteId: { eq: payload.siteId } },
    });
    for (const page of sitePages) {
      const selection = payload.pages.find((selection) => selection.pageId === page.id);
      if (selection === undefined) {
        yield* operations.updatePage({ resourceId: page.id, attributes: { isPublished: false } });
        continue;
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
        resourceId: selection.snapshotId,
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
        attributes: { isPublished: true, publishedSnapshotId: selection.snapshotId },
      });
    }
    yield* operations.updateSite({ resourceId: payload.siteId, attributes: { isPublished: true } });
  }),
});
