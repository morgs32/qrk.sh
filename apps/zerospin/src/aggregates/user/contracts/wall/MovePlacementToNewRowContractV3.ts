import { brickV2 as brick } from "../../models/brick/BrickV2";
import { backendLibrary } from "../../../../modules/backendLibrary";
import { measureWallFit, wallBreakpointWidths } from "../../layout/wallSizing";
import { upgradeAggregateContractRelease, findFirst, findMany } from "@zerospin/sdk/browser";
import { Effect, Result } from "effect";
import { wallV2 as wall } from "../../models/wall/WallV2";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { movePlacementToNewRowV2 } from "./MovePlacementToNewRowContractV2";
import { movePlacementToNewRowInLayout } from "../../layout/wallLayoutV3";

export const movePlacementToNewRowV3 = upgradeAggregateContractRelease(movePlacementToNewRowV2, {
  version: 3,
  payload: {},
  models: { wall, placement, brick },
  operations: { updateWall: wall.operations.update },
  program: Effect.fn("movePlacementToNewRow.program")(function* (props) {
    const { db, payload, operations, failures, claims } = props;
    if (claims === null)
      return yield* failures.invalidLayout.make({
        message: "Moving a Placement requires an authenticated user",
        status: 403,
      });
    const moving = yield* findFirst({
      db,
      model: db.models.placement,
      where: { id: { eq: payload.placementId } },
    });
    if (moving === undefined)
      return yield* failures.invalidLayout.make({
        message: "The Placement no longer exists",
        status: 404,
      });
    const wallRow = yield* findFirst({
      db,
      model: db.models.wall,
      where: { id: { eq: moving.wallId } },
    });
    if (wallRow === undefined)
      return yield* failures.invalidLayout.make({
        message: "The Placement's Wall no longer exists",
        status: 404,
      });
    const pageRow = yield* findFirst({
      db,
      model: db.models.page,
      where: { id: { eq: wallRow.pageId } },
    });
    const siteRow =
      pageRow === undefined
        ? undefined
        : yield* findFirst({
            db,
            model: db.models.site,
            where: { id: { eq: pageRow.siteId } },
          });
    const userRow =
      siteRow === undefined
        ? undefined
        : yield* findFirst({
            db,
            model: db.models.user,
            where: { id: { eq: siteRow.userId } },
          });
    if (
      siteRow === undefined ||
      userRow === undefined ||
      userRow.clerkUserId !== claims.clerkUserId
    )
      return yield* failures.invalidLayout.make({
        message: "This Page is unavailable",
        status: 403,
      });
    const changed = movePlacementToNewRowInLayout({
      layout: wallRow.layout,
      placementId: moving.id,
      stackId: payload.stackId,
      newRowId: payload.newRowId,
      beforeRowId: payload.beforeRowId,
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
          backendLibrary[entry.brick.moduleId].variants[entry.variantId].minWidth,
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
