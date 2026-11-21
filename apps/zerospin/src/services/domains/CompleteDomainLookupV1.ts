import {
  defineServiceContract,
  findFirst,
  makeCommandOperation,
  makeServiceContractRelease,
  primitives,
} from "@zerospin/sdk";
import * as Effect from "effect/Effect";
import { lookupUsername } from "./lookupUsername";
import { domainV1 } from "./DomainV1";
import { userAggregate } from "../../fresh/userAggregate";
import { applyDomainAssignmentV1 } from "../../fresh/contracts/ApplyDomainAssignmentV1";

const complete = makeCommandOperation({
  destination: { aggregate: userAggregate, version: 1 },
  contract: applyDomainAssignmentV1,
});
export const completeDomainLookupV1 = makeServiceContractRelease(
  defineServiceContract("completeDomainLookup"),
  {
    version: 1,
    payload: { ...lookupUsername.payload, username: primitives.text({ nullable: true }) },
    models: { domain: { model: domainV1, fields: ["siteId", "userId", "aggregateId", "hostname"] } },
    operations: { create: domainV1.operations.create, complete },
    program: Effect.fn("domains.lookupUsername.complete")(function* (props) {
      const { payload, db, operations } = props;
      const { username, ...domain } = payload;
      const existing = yield* findFirst({
        db,
        model: db.models.domain,
        where: { siteId: { eq: payload.siteId } },
      });
      let hostname: string | null = null;
      let message: string | null = null;
      if (existing !== undefined) {
        if (existing.userId === payload.userId && existing.aggregateId === payload.aggregateId)
          hostname = existing.hostname;
        else message = "This Site belongs to another user";
      } else if (username === null)
        message = "Save a username before creating a Site";
      else {
        if (!/^[a-z0-9]{1,56}$/.test(username)) message = "The recorded username is invalid";
        else {
          let hash = 2166136261;
          for (const char of payload.siteId)
            hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
          for (let offset = 0; offset < 32; offset += 1) {
            const candidate = `${username}-${((hash + offset) % 2176782336).toString(36).padStart(6, "0")}`;
            const occupied = yield* findFirst({
              db,
              model: db.models.domain,
              where: { hostname: { eq: candidate } },
            });
            if (occupied !== undefined) continue;
            hostname = candidate;
            yield* operations.create({
              resourceId: `dom_${payload.siteId}`,
              attributes: { hostname, ...domain },
            });
            break;
          }
          if (hostname === null) message = "Could not find an available Site address";
        }
      }
      yield* operations.complete({
        aggregateId: payload.aggregateId,
        payload: { siteId: payload.siteId, userId: payload.userId, hostname, message },
      });
    }),
  },
);
