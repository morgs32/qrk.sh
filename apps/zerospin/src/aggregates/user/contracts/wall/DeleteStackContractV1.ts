import {
  ContractError,
  defineAggregateContract,
  findFirst,
  findMany,
  makeAggregateContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect, Result } from "effect";
import { userClaims } from "../../../../claims";
import { stackIdSchema } from "../../layout/wallLayoutSchema";
import { removePlacementFromLayout } from "../../layout/wallLayoutV3";
import { brickV3 as brick } from "../../models/brick/BrickV3";
import { pageV1 as page } from "../../models/page/PageV1";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { siteV1 as site } from "../../models/site/SiteV1";
import { userV1 as user } from "../../models/user/UserV1";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { wall as wallIdentity } from "../../models/wall/wall";

export const deleteStackV1 = makeAggregateContractRelease(defineAggregateContract("deleteStack"), {
  version: 1,
  claims: userClaims,
  payload: {
    wallId: modelId({ model: wallIdentity }),
    stackId: primitives.json({ schema: stackIdSchema }),
    allWidths: primitives.boolean(),
  },
  models: { brick, page, placement, site, user, wall },
  operations: {
    updateWall: wall.operations.update,
    deletePlacement: placement.operations.delete,
    deleteBrick: brick.operations.delete,
  },
  failures: { invalidStack: ContractError.schema({ code: "delete-stack-invalid" }) },
  program: Effect.fn("deleteStack.program")(function* (props) {
    const { claims, db, failures, operations, payload } = props;
    const wallRow = yield* findFirst({
      db,
      model: db.models.wall,
      where: { id: { eq: payload.wallId } },
    });
    if (wallRow === undefined)
      return yield* failures.invalidStack.make({
        message: "The Wall no longer exists",
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
        : yield* findFirst({ db, model: db.models.site, where: { id: { eq: pageRow.siteId } } });
    const userRow =
      siteRow === undefined
        ? undefined
        : yield* findFirst({ db, model: db.models.user, where: { id: { eq: siteRow.userId } } });
    if (claims === null || userRow?.clerkUserId !== claims.clerkUserId)
      return yield* failures.invalidStack.make({
        message: "This Wall is unavailable",
        status: 403,
      });

    const section = wallRow.layout.sections.find((entry) =>
      entry.stacks.some((stack) => stack.id === payload.stackId),
    );
    const stack = section?.stacks.find((entry) => entry.id === payload.stackId);
    if (section === undefined || stack === undefined)
      return yield* failures.invalidStack.make({
        message: "The Stack no longer exists",
        status: 404,
      });

    const placementIds = stack.rows.flatMap((row) => row.placementIds);
    const remainingStacks = section.stacks.filter((entry) => entry.id !== stack.id);
    yield* operations.updateWall({
      resourceId: wallRow.id,
      attributes: {
        layout: {
          sections: wallRow.layout.sections.flatMap((entry) => {
            if (entry.id !== section.id) return [entry];
            return remainingStacks.length === 0 ? [] : [{ ...entry, stacks: remainingStacks }];
          }),
        },
      },
    });

    if (placementIds.length === 0) return;
    const localPlacements = yield* findMany({
      db,
      model: db.models.placement,
      where: { id: { in: placementIds }, wallId: { eq: wallRow.id } },
    });
    if (localPlacements.length !== placementIds.length)
      return yield* failures.invalidStack.make({
        message: "The Stack has invalid Placements",
        status: 409,
      });

    const brickIds = [...new Set(localPlacements.map((entry) => entry.brickId))];
    const placements = yield* findMany({
      db,
      model: db.models.placement,
      where: { brickId: { in: brickIds } },
      with: { wall: true, brick: true },
    });
    const retainedBrickIds = new Set(
      placements.filter((entry) => entry.wallId !== wallRow.id).map((entry) => entry.brickId),
    );
    const changedLayouts = new Map<typeof wallRow.id, typeof wallRow.layout>();

    for (const entry of placements) {
      if (entry.wall.pageId !== wallRow.pageId || entry.brick.pageId !== wallRow.pageId)
        return yield* failures.invalidStack.make({
          message: "A Placement belongs to another Page",
          status: 409,
        });
      if (entry.wallId === wallRow.id) {
        if (!placementIds.includes(entry.id))
          return yield* failures.invalidStack.make({
            message: "The Wall has a duplicate Brick Placement",
            status: 409,
          });
      } else {
        if (!payload.allWidths) continue;
        const layout = changedLayouts.get(entry.wallId) ?? entry.wall.layout;
        const changed = removePlacementFromLayout({ layout, placementId: entry.id });
        if (Result.isFailure(changed))
          return yield* failures.invalidStack.make({ message: changed.failure, status: 409 });
        changedLayouts.set(entry.wallId, changed.success);
      }
    }
    for (const [resourceId, layout] of changedLayouts)
      yield* operations.updateWall({ resourceId, attributes: { layout } });
    for (const entry of placements) {
      if (payload.allWidths || entry.wallId === wallRow.id)
        yield* operations.deletePlacement({ resourceId: entry.id });
    }
    for (const brickId of brickIds) {
      if (payload.allWidths || !retainedBrickIds.has(brickId))
        yield* operations.deleteBrick({ resourceId: brickId });
    }
  }),
});
