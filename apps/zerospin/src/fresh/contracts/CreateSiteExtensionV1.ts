import { makeAggregateContractExtension, makeCommandOperation } from "@zerospin/sdk";
import { Effect } from "effect";
import { assignDomainV1 } from "../../services/domains/AssignDomainV1";
import { domains } from "../../services/domains/domainsV1";
import { createSiteV1 } from "./CreateSiteV1";

export const createSiteExtensionV1 = makeAggregateContractExtension(createSiteV1, {
  models: {},
  operations: {
    assignDomain: makeCommandOperation({
      destination: { service: domains, version: 1 },
      contract: assignDomainV1,
    }),
  },
  program: Effect.fn("user.createSite.extension")(function* (props) {
    const { aggregateId, payload, operations } = props;
    yield* operations.assignDomain({
      payload: { siteId: payload.id, userId: payload.userId, aggregateId },
    });
  }),
});
