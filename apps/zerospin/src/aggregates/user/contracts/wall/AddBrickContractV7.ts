import { ContractError, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV3 as brick } from "../../models/brick/BrickV3";
import { addBrickV6 } from "./AddBrickContractV6";

export const addBrickV7 = upgradeAggregateContractRelease(addBrickV6, {
  version: 7,
  payload: { moduleId: brick.attributes.moduleId },
  models: { brick },
  operations: { createBrick: brick.operations.create },
  down: Effect.fn("addBrickV7.down")(function* (props) {
    const { payload } = props;
    if (payload.moduleId === "behance" || payload.moduleId === "buy-me-a-coffee")
      return yield* new ContractError({
        code: "brick-module-release-required",
        message: "This Brick module requires User release 12.",
        status: 409,
        extra: null,
      });
    return { ...payload, moduleId: payload.moduleId };
  }),
});
