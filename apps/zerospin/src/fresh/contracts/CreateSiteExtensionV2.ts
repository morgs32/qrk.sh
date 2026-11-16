import { userV1 } from "@qrk.sh/bricks/zerospin/models/user/UserV1";
import { findFirst, makeAggregateContractExtension, makeCommandOperation } from "@zerospin/sdk";
import { Effect } from "effect";
import { assignDomainV1 } from "../../services/domains/AssignDomainV1";
import { domains } from "../../services/domains/domainsV1";
import { completeDomainV1 } from "./CompleteDomainV1";
import { createSiteV2 } from "./CreateSiteV2";

export const createSiteExtensionV2 = makeAggregateContractExtension(createSiteV2, {
  models: { user: { model: userV1, fields: ["clerkUserId", "username"] } },
  operations: {
    assignDomain: makeCommandOperation({
      destination: { service: domains, version: 1 },
      contract: assignDomainV1,
      continuation: completeDomainV1,
    }),
  },
  program: Effect.fn("user.createSite.extension")(function* (props) {
    const { aggregateId, payload, db, operations, failures } = props;
    const owner = yield* findFirst({
      db,
      model: db.models.user,
      where: { id: { eq: payload.userId }, clerkUserId: { eq: aggregateId } },
    });
    if (owner === undefined || owner.username === null || owner.username === "") {
      return yield* failures.createSiteUserMismatch.make({
        message: "Save a username before creating a Site",
        status: 403,
      });
    }
    yield* operations.assignDomain({
      payload: { siteId: payload.id, userId: owner.id, aggregateId, username: owner.username },
      continuationPayload: { siteId: payload.id },
    });
  }),
});
