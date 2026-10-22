import { brick as brickIdentity } from "../../models/brick/brick";
import {
  modelId,
  ContractError,
  defineAggregateContract,
  makeAggregateContractVersion,
  findFirst,
  findMany,
} from "@zerospin/sdk/browser";
import { Effect, Result } from "effect";
import { userClaims } from "../../../../claims";
import { pageV1 as page } from "../../models/page/PageV1";
import { siteV1 as site } from "../../models/site/SiteV1";
import { userV1 as user } from "../../models/user/UserV1";
import { wallV1 as wall } from "../../models/wall/WallV1";
import { brickV1 as brick } from "../../models/brick/BrickV1";
import { placementV1 as placement } from "../../models/placement/PlacementV1";
import { removePlacementFromLayout } from "../../layout/wallLayout";

export const deleteBrickV1 = makeAggregateContractVersion(defineAggregateContract("deleteBrick"), {
  version: 1,
  models: { page, site, user, wall, brick, placement },
  claims: userClaims,
  operations: {
    updateWall: wall.operations.update,
    deleteBrick: brick.operations.delete,
    deletePlacement: placement.operations.delete,
  },
  payload: { brickId: modelId({ model: brickIdentity }) },
  failures: { invalidLayout: ContractError.schema({ code: "delete-brick-invalid-layout" }) },
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
