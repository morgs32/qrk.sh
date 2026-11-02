import { upgradeAggregateContractRelease, findFirst, findMany } from "@zerospin/sdk/browser";
import { Effect, Result } from "effect";
import { wallV2 as wall } from "../../models/wall/WallV2";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { deleteBrickV2 } from "./DeleteBrickContractV2";
import { removePlacementFromLayout } from "../../layout/wallLayoutV2";

export const deleteBrickV3 = upgradeAggregateContractRelease(deleteBrickV2, {
  version: 3,
  payload: {},
  models: { wall, placement },
  operations: { updateWall: wall.operations.update, deletePlacement: placement.operations.delete },
  program: Effect.fn("deleteBrick.program")(function* (props) {
    const { db, payload, operations, failures, claims } = props;
    const { brickId } = payload;
    const brickRow = yield* findFirst({
      db,
      model: db.models.brick,
      where: { id: { eq: brickId } },
    });
    if (brickRow === undefined)
      return yield* failures.invalidLayout.make({
        message: "The Brick no longer exists",
        status: 404,
      });
    const pageId = brickRow.pageId;
    const pageRow = yield* findFirst({ db, model: db.models.page, where: { id: { eq: pageId } } });
    const siteRow =
      pageRow === undefined || pageRow.siteId === null
        ? undefined
        : yield* findFirst({ db, model: db.models.site, where: { id: { eq: pageRow.siteId } } });
    const userRow =
      siteRow === undefined || siteRow.userId === null
        ? undefined
        : yield* findFirst({ db, model: db.models.user, where: { id: { eq: siteRow.userId } } });
    if (userRow === undefined || userRow.clerkUserId !== claims?.clerkUserId)
      return yield* failures.invalidLayout.make({
        message: "This Page is unavailable",
        status: 403,
      });
    const placements = yield* findMany({
      db,
      model: db.models.placement,
      where: { brickId: { eq: brickId } },
      with: { wall: true },
    });
    for (const entry of placements) {
      if (entry.wall.pageId !== pageId)
        throw new Error("The Brick's Placement belongs to another Page");
      const changed = removePlacementFromLayout({
        layout: entry.wall.layout,
        placementId: entry.id,
      });
      if (Result.isFailure(changed))
        return yield* failures.invalidLayout.make({ message: changed.failure, status: 409 });
      yield* operations.updateWall({
        resourceId: entry.wallId,
        attributes: { layout: changed.success },
      });
      yield* operations.deletePlacement({ resourceId: entry.id });
    }
    yield* operations.deleteBrick({ resourceId: brickId });
  }),
});
