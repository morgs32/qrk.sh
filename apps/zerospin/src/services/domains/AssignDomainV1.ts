import { site } from "@qrk.sh/bricks/zerospin/models/site/site";
import { user } from "@qrk.sh/bricks/zerospin/models/user/user";
import { ContractError } from "@zerospin/error";
import {
  defineServiceContract,
  findFirst,
  makeServiceContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect, Schema } from "effect";
import { domainV1 } from "./DomainV1";

const assignDomain = defineServiceContract("assignDomain");

export const assignDomainV1 = makeServiceContractRelease(assignDomain, {
  version: 1,
  payload: {
    siteId: modelId({ model: site }),
    userId: modelId({ model: user }),
    aggregateId: primitives.text(),
    username: primitives.text(),
  },
  result: Schema.Struct({ hostname: Schema.NonEmptyString }),
  models: { domain: { model: domainV1, fields: ["hostname", "siteId", "userId", "aggregateId"] } },
  operations: { create: domainV1.operations.create },
  failures: {
    invalidUsername: ContractError.schema({ code: "domain-username-invalid" }),
    ownerMismatch: ContractError.schema({ code: "domain-owner-mismatch" }),
    exhausted: ContractError.schema({ code: "domain-candidates-exhausted" }),
  },
  program: Effect.fn("domains.assignDomain")(function* (props) {
    const { payload, db, operations, failures } = props;
    const { siteId, userId, aggregateId, username } = payload;
    if (!/^[a-z0-9]{1,56}$/.test(username) || aggregateId.length === 0) {
      return yield* failures.invalidUsername.make({
        message: "Username must use 1–56 lowercase letters or numbers",
      });
    }
    const existing = yield* findFirst({
      db,
      model: db.models.domain,
      where: { siteId: { eq: siteId } },
    });
    if (existing !== undefined) {
      if (existing.userId !== userId || existing.aggregateId !== aggregateId) {
        return yield* failures.ownerMismatch.make({ message: "This Site belongs to another user" });
      }
      return { hostname: existing.hostname };
    }
    let hash = 2166136261;
    for (const char of siteId) {
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    }
    for (let offset = 0; offset < 32; offset += 1) {
      const suffix = ((hash + offset) % 2176782336).toString(36).padStart(6, "0");
      const hostname = `${username}-${suffix}`;
      const occupied = yield* findFirst({
        db,
        model: db.models.domain,
        where: { hostname: { eq: hostname } },
      });
      if (occupied !== undefined) continue;
      const id: `dom_${string}` = `dom_${siteId}`;
      yield* operations.create({
        resourceId: id,
        attributes: { hostname, siteId, userId, aggregateId },
      });
      return { hostname };
    }
    return yield* failures.exhausted.make({ message: "Could not find an available Site address" });
  }),
});
