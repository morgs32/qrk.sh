import { findFirst, findMany, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect, Result } from "effect";
import { backendLibrary } from "../../../../modules/backendLibrary";
import { canShareRow } from "../../../../modules/lib/canShareRow";
import { movePlacementToRowInLayout } from "../../layout/wallLayout";
import { brickV2 as brick } from "../../models/brick/BrickV2";
import { movePlacementToRowV1 } from "./MovePlacementToRowContractV1";

export const movePlacementToRowV2 = upgradeAggregateContractRelease(movePlacementToRowV1, {
  version: 2,
  models: { brick },
  payload: {},
  operations: {},
  program: Effect.fn("movePlacementToRow.program")(function* (props) {
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
      with: { brick: true },
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
    if (userRow === undefined || userRow.clerkUserId !== claims.clerkUserId)
      return yield* failures.invalidLayout.make({
        message: "This Page is unavailable",
        status: 403,
      });
    const changed = movePlacementToRowInLayout({
      layout: wallRow.layout,
      placementId: moving.id,
      rowId: payload.rowId,
      beforePlacementId: payload.beforePlacementId,
      stackLimit: { sm: 1, md: 2, lg: 3, xl: 4 }[wallRow.breakpoint],
    });
    if (Result.isFailure(changed))
      return yield* failures.invalidLayout.make({ message: changed.failure, status: 409 });
    if (changed.success === wallRow.layout) return;
    const destination = wallRow.layout.sections
      .flatMap((section) => section.stacks)
      .flatMap((stack) => stack.rows)
      .find((row) => row.id === payload.rowId);
    if (destination === undefined) throw new Error("The validated destination Row is missing");
    const existingPlacements = yield* findMany({
      db,
      model: db.models.placement,
      where: { wallId: { eq: wallRow.id }, id: { in: destination.placementIds } },
      with: { brick: true },
    });
    if (
      moving.brick.pageId !== wallRow.pageId ||
      existingPlacements.length !== destination.placementIds.length ||
      existingPlacements.some((entry) => entry.brick.pageId !== wallRow.pageId)
    )
      throw new Error("The Row contains a Placement missing from its Wall");
    if (
      !canShareRow({
        incomingVariant: backendLibrary[moving.brick.moduleId].variants[moving.variantId],
        existingVariants: existingPlacements
          .filter((entry) => entry.id !== moving.id)
          .map((entry) => backendLibrary[entry.brick.moduleId].variants[entry.variantId]),
      })
    )
      return yield* failures.invalidLayout.make({
        message: "Variable-height Bricks require their own Row",
        status: 409,
      });
    yield* operations.updateWall({
      resourceId: wallRow.id,
      attributes: { layout: changed.success },
    });
  }),
});
