import { placement as placementIdentity } from "../../models/placement/placement";
import {
  modelId,
  ContractError,
  defineAggregateContract,
  makeAggregateContractRelease,
  findFirst,
  prefixId,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect, Result } from "effect";
import { userClaims } from "../../../../claims";
import { pageV1 as page } from "../../models/page/PageV1";
import { siteV1 as site } from "../../models/site/SiteV1";
import { userV1 as user } from "../../models/user/UserV1";
import { wallV1 as wall } from "../../models/wall/WallV1";
import { brickV1 as brick } from "../../models/brick/BrickV1";
import { placementV1 as placement } from "../../models/placement/PlacementV1";
import { movePlacementInLayout } from "../../layout/wallLayout";
import { wallInsertionTargetSchema } from "../../layout/wallTargetSchemas";

export const movePlacementV1 = makeAggregateContractRelease(
  defineAggregateContract("movePlacement"),
  {
    version: 1,
    models: { page, site, user, wall, brick, placement },
    claims: userClaims,
    operations: { updateWall: wall.operations.update },
    payload: {
      id: primitives.text(),
      placementId: modelId({ model: placementIdentity }),
      target: primitives.json({ schema: wallInsertionTargetSchema }),
    },
    failures: { invalidLayout: ContractError.schema({ code: "move-placement-invalid-layout" }) },
    program: Effect.fn("movePlacement.program")(function* (props) {
      const { db, payload, operations, failures, claims } = props;
      const { target } = payload;
      const moving = yield* findFirst({
        db,
        model: db.models.placement,
        where: { id: { eq: payload.placementId } },
      });
      const brickRow =
        moving === undefined
          ? undefined
          : yield* findFirst({ db, model: db.models.brick, where: { id: { eq: moving.brickId } } });
      if (moving === undefined || brickRow === undefined)
        return yield* failures.invalidLayout.make({
          message: "The Placement no longer exists",
          status: 404,
        });
      const pageId = brickRow.pageId;
      const pageRow = yield* findFirst({
        db,
        model: db.models.page,
        where: { id: { eq: pageId } },
      });
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
      const wallRow = yield* findFirst({
        db,
        model: db.models.wall,
        where: { id: { eq: target.wallId } },
      });
      if (wallRow === undefined || wallRow.pageId !== pageId || moving.wallId !== wallRow.id)
        return yield* failures.invalidLayout.make({
          message: "Placements can only move within their Wall",
          status: 409,
        });
      const changed = movePlacementInLayout({
        layout: wallRow.layout,
        target,
        placementId: moving.id,
        newNodeIds: {
          sectionId: prefixId({ abbreviation: "sec" }, `${payload.id}_${wallRow.id}`),
          stackId: prefixId({ abbreviation: "stk" }, `${payload.id}_${wallRow.id}`),
          rowId: prefixId({ abbreviation: "row" }, `${payload.id}_${wallRow.id}`),
        },
        stackLimit: { sm: 1, md: 2, lg: 3, xl: 4 }[wallRow.breakpoint],
      });
      if (Result.isFailure(changed))
        return yield* failures.invalidLayout.make({ message: changed.failure, status: 409 });
      if (changed.success !== wallRow.layout)
        yield* operations.updateWall({
          resourceId: wallRow.id,
          attributes: { layout: changed.success },
        });
    }),
  },
);
