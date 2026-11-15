import { AggregateError, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";

import { createPageV1 } from "./CreatePageV1";

export const createPageV2 = upgradeAggregateContractRelease(createPageV1, {
  version: 2,
  payload: {},
  failures: {
    ...createPageV1.failures,
    createPagePathInvalid: AggregateError.schema({ code: "create-page-path-invalid" }),
    createPagePathTaken: AggregateError.schema({ code: "create-page-path-taken" }),
  },
  down: (props) => {
    const { payload } = props;
    return Effect.succeed(payload);
  },
});
