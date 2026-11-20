import {
  defineServiceContract,
  makeServiceContractRelease,
  modelId,
  primitives,
  makeCommandOperation,
  findFirst,
} from "@zerospin/sdk";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { user } from "@qrk.sh/bricks/zerospin/models/user/user";
import { site } from "@qrk.sh/bricks/zerospin/models/site/site";
import { lookupUsername } from "./lookupUsername";
import { domainV1 } from "./DomainV1";
import { userAggregate } from "../../fresh/userAggregate";
import { applyDomainAssignmentV1 } from "../../fresh/contracts/ApplyDomainAssignmentV1";

export const assignDomainV1 = makeServiceContractRelease(defineServiceContract("assignDomain"), {
  version: 1,
  payload: {
    siteId: modelId({ model: site }),
    userId: modelId({ model: user }),
    aggregateId: primitives.text(),
  },
  result: Schema.Null,
  models: { domain: { model: domainV1, fields: ["siteId", "userId", "aggregateId", "hostname"] } },
  operations: {
    lookup: lookupUsername.externalOperation,
    complete: makeCommandOperation({
      destination: { aggregate: userAggregate, version: 1 },
      contract: applyDomainAssignmentV1,
    }),
  },
  program: Effect.fn("domains.assignDomain")(function* (props) {
    const { payload, db, operations } = props;
    const existing = yield* findFirst({
      db,
      model: db.models.domain,
      where: { siteId: { eq: payload.siteId } },
    });
    if (existing !== undefined) {
      const owned =
        existing.userId === payload.userId && existing.aggregateId === payload.aggregateId;
      yield* operations.complete({
        aggregateId: payload.aggregateId,
        payload: {
          siteId: payload.siteId,
          userId: payload.userId,
          hostname: owned ? existing.hostname : null,
          message: owned ? null : "This Site belongs to another user",
        },
      });
    } else {
      yield* operations.lookup({ payload });
    }
    return null;
  }),
});
