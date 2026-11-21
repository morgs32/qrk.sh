import { SecretKey } from "@zerospin/core/services/SecretKey";
import { getSystemApi } from "@zerospin/core/utils/getSystemApi/getSystemApi";
import {
  makeQueryDbVersion,
  makeServiceExternalContractRelease,
  ZerospinApiUrl,
  makeZerospinError,
} from "@zerospin/sdk";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { recordDomainLookupFailureV1 } from "./RecordDomainLookupFailureV1";
import { lookupUsername } from "./lookupUsername";
import { usernameV1 } from "../users/UsernameV1";
import { completeDomainLookupV1 } from "./CompleteDomainLookupV1";

const usersDb = makeQueryDbVersion({ models: { username: usernameV1 } });
export const lookupUsernameV1 = makeServiceExternalContractRelease(lookupUsername, {
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
  onSuccess: {
    contract: completeDomainLookupV1,
    payload: Effect.fn("domains.lookupUsername.onSuccess")(function* (props) {
      const { payload, response } = props;
      return { ...payload, username: response.username };
    }),
  },
  onFailure: {
    contract: recordDomainLookupFailureV1,
    payload: Effect.fn("domains.lookupUsername.onFailure")(function* (props) {
      const { payload } = props;
      return payload;
    }),
  },
});
