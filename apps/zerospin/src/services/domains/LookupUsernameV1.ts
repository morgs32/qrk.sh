import { SecretKey } from "@zerospin/core/services/SecretKey";
import { getSystemApi } from "@zerospin/core/utils/getSystemApi/getSystemApi";
import {
  makeQueryDbVersion,
  makeServiceExternalContractRelease,
  makeCommandOperation,
  findFirst,
  ZerospinApiUrl,
  makeZerospinError,
} from "@zerospin/sdk";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { recordDomainLookupFailureV1 } from "./RecordDomainLookupFailureV1";
import { lookupUsername } from "./lookupUsername";
import { usernameV1 } from "../users/UsernameV1";
import { domainV1 } from "./DomainV1";
import { userAggregate } from "../../fresh/userAggregate";
import { applyDomainAssignmentV1 } from "../../fresh/contracts/ApplyDomainAssignmentV1";

const usersDb = makeQueryDbVersion({ models: { username: usernameV1 } });
const complete = makeCommandOperation({
  destination: { aggregate: userAggregate, version: 1 },
  contract: applyDomainAssignmentV1,
});
export const lookupUsernameV1 = makeServiceExternalContractRelease(lookupUsername, {
  models: { domain: { model: domainV1, fields: ["siteId", "userId", "aggregateId", "hostname"] } },
  operations: { create: domainV1.operations.create, complete },
  onFailure: {
    contract: recordDomainLookupFailureV1,
    payload: (props) => {
      const { payload } = props;
      return payload;
    },
  },
  request: Effect.fn("domains.lookupUsername.request")(function* (props) {
    const { payload } = props;
    const { env } = yield* Effect.promise(() => import("cloudflare:workers"));
    const config = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        ZEROSPIN_API_URL: Schema.NonEmptyString,
        ZEROSPIN_SECRET_KEY: Schema.NonEmptyString,
      }),
    )(env).pipe(
      Effect.mapError(() =>
        makeZerospinError({
          code: "users-lookup-unavailable",
          message: "The Users lookup connection is not configured",
        }),
      ),
    );
    const row = yield* Effect.gen(function* () {
      const api = yield* getSystemApi();
      return yield* api.executeServiceQuery({
        serviceName: "users",
        serviceVersion: 1,
        query: usersDb.query.username.findFirst({
          where: { userId: { eq: payload.userId }, aggregateId: { eq: payload.aggregateId } },
        }),
      });
    }).pipe(
      Effect.mapError(() =>
        makeZerospinError({
          code: "users-lookup-unavailable",
          message: "The Users lookup outcome is unavailable",
        }),
      ),
      Effect.provideService(ZerospinApiUrl, config.ZEROSPIN_API_URL),
      Effect.provideService(SecretKey, Redacted.make(config.ZEROSPIN_SECRET_KEY)),
    );
    return { username: row?.username ?? null };
  }),
  program: Effect.fn("domains.lookupUsername.complete")(function* (props) {
    const { payload, externalOutcome, db, operations } = props;
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
    } else if (externalOutcome._tag === "Failure") message = externalOutcome.failure.message;
    else if (externalOutcome.success.username === null)
      message = "Save a username before creating a Site";
    else {
      const username = externalOutcome.success.username;
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
            attributes: { hostname, ...payload },
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
});
