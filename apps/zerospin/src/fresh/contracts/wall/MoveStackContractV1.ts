import { brickV1 as brick } from "@qrk.sh/bricks/zerospin/models/brick/BrickV1";
import { placementV1 as placement } from "@qrk.sh/bricks/zerospin/models/placement/PlacementV1";
import { measureWallFit, wallBreakpointWidths } from "@qrk.sh/bricks/zerospin/wall/wallSizing";
import { backendLibrary } from "@qrk.sh/bricks/modules/backendLibrary";
import { findMany } from "@zerospin/sdk/browser";
import {
  ContractError,
  defineAggregateContract,
  makeAggregateContractRelease,
  findFirst,
  prefixId,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect, Result } from "effect";
import { userClaims } from "@qrk.sh/bricks/zerospin/userClaims";
import { pageV1 as page } from "@qrk.sh/bricks/zerospin/models/page/PageV1";
import { siteV1 as site } from "@qrk.sh/bricks/zerospin/models/site/SiteV1";
import { userV1 as user } from "@qrk.sh/bricks/zerospin/models/user/UserV1";
import { wallV1 as wall } from "@qrk.sh/bricks/zerospin/models/wall/WallV1";
import { moveStackInLayout } from "@qrk.sh/bricks/zerospin/wall/wallLayout";
import { stackMoveTargetSchema } from "@qrk.sh/bricks/zerospin/wall/stackMoveTargetSchema";
import { stackIdSchema } from "@qrk.sh/bricks/zerospin/models/wall/wallLayoutSchema";

export const moveStackV1 = makeAggregateContractRelease(defineAggregateContract("moveStack"), {
  version: 1,
  models: {
    page: {
      model: page,
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
    site: {
      model: site,
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
    user: { model: user, fields: ["createdAt", "updatedAt", "clerkUserId", "displayName"] },
    wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] },
    brick: {
      model: brick,
      fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth"],
    },
    placement: {
      model: placement,
      fields: ["createdAt", "updatedAt", "state", "brickId", "wallId", "layoutId", "widthWeight"],
    },
  },
  claims: userClaims,
  operations: { updateWall: wall.operations.update },
  payload: {
    id: primitives.text(),
    stackId: primitives.json({ schema: stackIdSchema }),
    target: primitives.json({ schema: stackMoveTargetSchema }),
  },
  failures: { invalidLayout: ContractError.schema({ code: "move-stack-invalid-layout" }) },
  program: Effect.fn("moveStack.program")(function* (props) {
    const { db, payload, operations, failures, claims } = props;
    const { target } = payload;
    const wallRow = yield* findFirst({
      db,
      model: db.models.wall,
      where: { id: { eq: target.wallId } },
    });
    if (
      wallRow === undefined ||
      !wallRow.layout.sections.some((entry) =>
        entry.stacks.some((entry) => entry.id === payload.stackId),
      )
    )
      return yield* failures.invalidLayout.make({
        message: "Stacks can only move within their Wall",
        status: 409,
      });
    const pageId = wallRow.pageId;
    const pageRow = yield* findFirst({ db, model: db.models.page, where: { id: { eq: pageId } } });
    const siteRow =
      pageRow === undefined || pageRow.siteId === null
        ? undefined
        : yield* findFirst({ db, model: db.models.site, where: { id: { eq: pageRow.siteId } } });
    const userRow =
      siteRow === undefined || siteRow.userId === null
        ? undefined
        : yield* findFirst({ db, model: db.models.user, where: { id: { eq: siteRow.userId } } });
    if (
      siteRow === undefined ||
      userRow === undefined ||
      userRow.clerkUserId !== claims?.clerkUserId
    )
      return yield* failures.invalidLayout.make({
        message: "This Page is unavailable",
        status: 403,
      });
    const changed = moveStackInLayout({
      layout: wallRow.layout,
      target,
      stackId: payload.stackId,
      newSectionId: prefixId({ abbreviation: "sec" }, payload.id),
    });
    if (Result.isFailure(changed))
      return yield* failures.invalidLayout.make({ message: changed.failure, status: 409 });
    if (changed.success === wallRow.layout) return;
    const placements = yield* findMany({
      db,
      model: db.models.placement,
      where: { wallId: { eq: wallRow.id } },
      with: { brick: true },
    });
    if (placements.some((entry) => entry.brick.pageId !== wallRow.pageId))
      throw new Error("The Wall contains a Placement from another Page");
    const fit = measureWallFit({
      layout: changed.success,
      placementMinimumWidths: new Map(
        placements.map((entry) => [
          entry.id,
          backendLibrary[entry.brick.moduleId].variants.default.minWidth,
        ]),
      ),
      wallWidth: wallBreakpointWidths[wallRow.breakpoint],
      brickGap: siteRow.brickGap,
    });
    if (fit.some((section) => !section.fits))
      return yield* failures.invalidLayout.make({
        message: "Not enough space in this Section",
        status: 409,
      });

    yield* operations.updateWall({
      resourceId: wallRow.id,
      attributes: { layout: changed.success },
    });
  }),
});
