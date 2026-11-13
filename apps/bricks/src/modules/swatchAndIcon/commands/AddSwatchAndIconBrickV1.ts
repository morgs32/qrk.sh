import { defineAggregateContract, makeAggregateContractRelease, modelId, primitives } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brick } from "../../../zerospin/models/brick/brick";
import { brickV1 } from "../../../zerospin/models/brick/BrickV1";
import { page } from "../../../zerospin/models/page/page";
import { pageV1 } from "../../../zerospin/models/page/PageV1";
import { placementV1 } from "../../../zerospin/models/placement/PlacementV1";
import { siteV1 } from "../../../zerospin/models/site/SiteV1";
import { userV1 } from "../../../zerospin/models/user/UserV1";
import { wallV1 } from "../../../zerospin/models/wall/WallV1";
import { userClaims } from "../../../zerospin/userClaims";
import { insertBrickInWall, wallInsertionFailure } from "../../../zerospin/wall/insertBrickInWall";
import { wallInsertionTargetSchema } from "../../../zerospin/wall/wallInsertionTargetSchema";
import { completeStateSchema, swatchAndIconV1 } from "../definition/swatchAndIconV1";

export const addSwatchAndIconBrickV1 = makeAggregateContractRelease(defineAggregateContract("addSwatchAndIconBrick"), {
  version: 1,
  claims: userClaims,
  payload: {
    brickId: modelId({ model: brick }),
    pageId: modelId({ model: page }),
    target: primitives.json({ schema: wallInsertionTargetSchema }),
    state: primitives.json({ schema: completeStateSchema }),
  },
  models: { brick: brickV1, page: pageV1, placement: placementV1, site: siteV1, user: userV1, wall: wallV1 },
  operations: {
    createBrick: brickV1.operations.create,
    createPlacement: placementV1.operations.create,
    updateWall: wallV1.operations.update,
  },
  failures: { invalidLayout: wallInsertionFailure },
  program: Effect.fn("addSwatchAndIconBrick.program")(function* (props) {
    const { payload, operations, db, claims } = props;
    yield* operations.createBrick({
      resourceId: payload.brickId,
      attributes: { pageId: payload.pageId, moduleId: "swatch-and-icon", state: structuredClone(payload.state), borderWidth: 0 },
    });
    yield* insertBrickInWall({
      db, operations, claims,
      brickId: payload.brickId,
      pageId: payload.pageId,
      target: payload.target,
      module: swatchAndIconV1,
      layoutId: "default",
      placementState: {},
    });
  }),
});
