import { upgradeAggregateContractRelease, findFirst } from "@zerospin/sdk/browser";
import { Effect, Result } from "effect";
import { wallV2 as wall } from "../../models/wall/WallV2";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { movePlacementToNewStackV1 } from "./MovePlacementToNewStackContractV1";
import { movePlacementToNewStackInLayout } from "../../layout/wallLayoutV2";

export const movePlacementToNewStackV2 = upgradeAggregateContractRelease(
  movePlacementToNewStackV1,
  {
    version: 2,
    payload: {},
    models: { wall, placement },
    operations: { updateWall: wall.operations.update },
    program: Effect.fn("movePlacementToNewStack.program")(function* (props) {
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
      if (userRow === undefined || userRow.clerkUserId !== claims.clerkUserId)
        return yield* failures.invalidLayout.make({
          message: "This Page is unavailable",
          status: 403,
        });
      const changed = movePlacementToNewStackInLayout({
        layout: wallRow.layout,
        placementId: moving.id,
        sectionId: payload.sectionId,
        newStackId: payload.newStackId,
        newRowId: payload.newRowId,
        stackLimit: { sm: 1, md: 2, lg: 3, xl: 4 }[wallRow.breakpoint],
      });
      if (Result.isFailure(changed))
        return yield* failures.invalidLayout.make({ message: changed.failure, status: 409 });
      if (changed.success === wallRow.layout) return;
      yield* operations.updateWall({
        resourceId: wallRow.id,
        attributes: { layout: changed.success },
      });
    }),
  },
);
