import { findFirst, makeAggregateContractAdapter } from "@zerospin/sdk";
import { Effect } from "effect";

import { makePlacementId } from "../../../../modules/lib/makePlacementId";
import { brickV1 as brick } from "../../models/brick/BrickV1";
import { placementV1 as placement } from "../../models/placement/PlacementV1";
import { generateBrickSpecExternalV1 } from "./GenerateBrickSpecExternalV1";
import { generateBrickSpecV1 } from "./GenerateBrickSpecV1";

export const generateBrickSpecServerV1 = makeAggregateContractAdapter({
  contractVersion: generateBrickSpecV1,
  models: { brick, placement },
  operations: {
    updatePlacement: placement.operations.update,
    generateSpec: generateBrickSpecExternalV1.externalOperation,
  },
  program: Effect.fn("generateBrickSpecServer.program")(function* (props) {
    const { db, payload, operations, failures } = props;
    const checked = yield* generateBrickSpecV1.execution;
    const brickRow = yield* findFirst({
      db,
      model: db.models.brick,
      where: { id: { eq: payload.brickId } },
    });
    const placementRow = yield* findFirst({
      db,
      model: db.models.placement,
      where: { id: { eq: makePlacementId(payload.brickId, payload.breakpoint) } },
    });
    if (brickRow === undefined || placementRow === undefined) {
      return yield* failures.unavailable.make({
        message: "This placement does not support spec generation",
        status: 404,
      });
    }
    for (const operation of checked.operations) {
      yield* operations.updatePlacement({
        resourceId: operation.resourceId,
        attributes: operation.body.attributes,
      });
    }
    yield* operations.generateSpec({
      payload: {
        brickId: brickRow.id,
        breakpoint: payload.breakpoint,
        moduleId: brickRow.moduleId,
        requestId: payload.requestId,
        prompt: payload.prompt.trim(),
        baseStateRevision: brickRow.stateRevision,
        baseSpecRevision: placementRow.specRevision,
        state: brickRow.state,
        currentSpec: placementRow.spec,
      },
    });
  }),
});
