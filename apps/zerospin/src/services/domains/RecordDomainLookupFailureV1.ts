import {
  makeServiceContractRelease,
  defineServiceContract,
  makeCommandOperation,
} from "@zerospin/sdk";
import { Effect } from "effect";
import { lookupUsername } from "./lookupUsername";
import { userAggregate } from "../../fresh/userAggregate";
import { applyDomainAssignmentV1 } from "../../fresh/contracts/ApplyDomainAssignmentV1";
const complete = makeCommandOperation({
  destination: { aggregate: userAggregate, version: 1 },
  contract: applyDomainAssignmentV1,
});
export const recordDomainLookupFailureV1 = makeServiceContractRelease(
  defineServiceContract("recordDomainLookupFailure"),
  {
    version: 1,
    payload: lookupUsername.payload,
    operations: { complete },
    program: Effect.fn("domains.recordLookupFailure")(function* (props) {
      const { payload, operations } = props;
      yield* operations.complete({
        aggregateId: payload.aggregateId,
        payload: {
          siteId: payload.siteId,
          userId: payload.userId,
          hostname: null,
          message: "Domain assignment could not be completed",
        },
      });
    }),
  },
);
