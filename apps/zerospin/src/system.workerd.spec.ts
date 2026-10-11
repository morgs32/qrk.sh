import { InternalRpcEnvelopeSchema } from "@zerospin/logger";
import { makeContractReadDb } from "@zerospin/core/contracts/make/makeContractReadDb";

import { it } from "@effect/vitest";

import { makeResourceDbConfig } from "@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig";
import { makeProvisionedInMemorySqljsDb } from "@zerospin/core/drizzle/make/makeProvisionedInMemorySqljsDb/makeProvisionedInMemorySqljsDb";
import { ZerospinError } from "@zerospin/sdk";
import { NanoIdFactory } from "@zerospin/core/utils/NanoIdFactory";
import { readRpcEnvelope } from "@zerospin/core/utils/readRpcEnvelope";
import { makeSystemSpec } from "@zerospin/core/system/make/makeSystemSpec";
import { AggregateChain, SystemRepo, AggregateVersionRepo } from "system-worker";
import { Effect, Schema } from "effect";
import { describe, expect, vi, beforeAll } from "vitest";

import { userSessionDefinition } from "./aggregates/user/userSessionDefinition";
import { userAggregateV1 } from "./aggregates/user/UserV1";
import { createUserV1 as createUser } from "./aggregates/user/contracts/createUser/CreateUserV1";
import { signature } from "./signature";
import { system } from "./system";

vi.mock("@clerk/backend", () => ({
  verifyToken: async (sessionToken: string) => {
    if (sessionToken === "invalid-token") throw new Error("Invalid token");
    return { sub: sessionToken };
  },
}));
beforeAll(() => vi.resetModules());

describe("QRK system", () => {
  it.effect(
    "provisions one independent user across a lost response and concurrent authentications",
    () =>
      Effect.gen(function* () {
        const { userActorV1 } = yield* Effect.promise(
          () => import("./aggregates/user/actors/userActorV1"),
        );
        const { provisionAuthenticatedUser } = yield* Effect.promise(
          () => import("./aggregates/user/actors/provisionAuthenticatedUser"),
        );
        const systemId = "sys_qrk_sh_1";
        const systemRepo = yield* SystemRepo.getRepo({ key: { systemId } });
        yield* Effect.promise(() =>
          systemRepo.acceptSystemSpec({ spec: makeSystemSpec({ system }) }),
        ).pipe(Effect.flatMap(readRpcEnvelope));
        for (const loseFirstResponse of [true, false]) {
          const clerkUserId = loseFirstResponse
            ? "user_provisioning_retry"
            : "user_provisioning_concurrent";
          const aggregateId = `acct_${clerkUserId}`;
          const claims = yield* userActorV1.authentication.authenticate({
            aggregateId,
            credentials: { sessionToken: clerkUserId },
          });
          const key = { systemId, aggregateId, aggregateName: "user", aggregateVersion: "1.0.0" };
          const chain = yield* AggregateChain.getRepo({ key });
          const attempts: { id: string; failureCode: string | null }[] = [];
          let loseResponse = loseFirstResponse;
          const observedChain: Pick<AggregateChain, "executeAggregateCommand"> = {
            executeAggregateCommand: async (props) => {
              const { command } = props;
              expect(command.origin).toEqual({
                kind: "actor",
                actorName: "provisioner",
                actorVersion: "1.0.0",
                claims,
              });
              const envelope = await chain.executeAggregateCommand(props);
              const failureCode =
                envelope.result._tag === "Failure"
                  ? envelope.result.failure.code
                  : envelope.result.success.finalization._tag === "ZerospinSuccess"
                    ? null
                    : envelope.result.success.finalization.code;
              attempts.push({ id: command.id, failureCode });
              if (loseResponse) {
                loseResponse = false;
                throw new ZerospinError({
                  code: "test-response-lost",
                  message: "Response lost after commit",
                });
              }
              return envelope;
            },
          };
          const provision = () =>
            provisionAuthenticatedUser({
              chain: observedChain,
              systemName: "qrk-sh",
              aggregateId,
              claims,
            });
          if (loseFirstResponse) {
            const lost = yield* provision().pipe(Effect.flip);
            expect(lost.code).toBe("user-provisioning-failed");
            expect(lost.cause).toContain("Response lost after commit");
            expect(attempts[0]?.failureCode).toBeNull();
          }
          yield* Effect.all([provision(), provision(), provision()], { concurrency: "unbounded" });
          expect(new Set(attempts.map((attempt) => attempt.id)).size).toBe(
            loseFirstResponse ? 4 : 3,
          );
          expect(attempts.filter((attempt) => attempt.failureCode === null)).toHaveLength(1);
          expect(
            attempts.filter((attempt) => attempt.failureCode === "user-already-exists"),
          ).toHaveLength(loseFirstResponse ? 3 : 2);
          const repo = yield* AggregateVersionRepo.getRepo({ key });
          const data = yield* Effect.promise(() =>
            repo.getRepoTableRows({ tableName: "user" }),
          ).pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(InternalRpcEnvelopeSchema)),
            Effect.flatMap((envelope) => readRpcEnvelope(envelope)),
          );
          const { rows: users } = yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              rows: Schema.Array(Schema.Struct({ id: Schema.String, clerkUserId: Schema.String })),
            }),
          )(data);
          expect(users).toHaveLength(1);
          expect(users[0]?.clerkUserId).toBe(clerkUserId);
          expect(users[0]?.id).toMatch(/^usr_/);
          expect(users[0]?.id).not.toBe(`usr_${clerkUserId}`);
        }
      }).pipe(Effect.provide(NanoIdFactory)),
  );

  it.effect("fails provisioning for terminal command errors other than an existing user", () =>
    Effect.gen(function* () {
      const { userActorV1 } = yield* Effect.promise(
        () => import("./aggregates/user/actors/userActorV1"),
      );
      const { provisionAuthenticatedUser } = yield* Effect.promise(
        () => import("./aggregates/user/actors/provisionAuthenticatedUser"),
      );
      const aggregateId = "acct_user_rejected_provisioning";
      const claims = yield* userActorV1.authentication.authenticate({
        aggregateId,
        credentials: { sessionToken: "user_rejected_provisioning" },
      });
      const chain = yield* AggregateChain.getRepo({
        key: { systemId: "sys_qrk_sh_1", aggregateName: "user", aggregateId },
      });
      const rejectedChain: Pick<AggregateChain, "executeAggregateCommand"> = {
        executeAggregateCommand: (props) => {
          const { command } = props;
          return chain.executeAggregateCommand({
            command: {
              ...command,
              payload: JSON.stringify({
                ...JSON.parse(command.payload),
                clerkUserId: "other_user",
              }),
            },
          });
        },
      };
      const failure = yield* provisionAuthenticatedUser({
        chain: rejectedChain,
        systemName: "qrk-sh",
        aggregateId,
        claims,
      }).pipe(Effect.flip);
      expect(failure.code).toBe("user-provisioning-failed");
    }).pipe(Effect.provide(NanoIdFactory)),
  );

  it.effect("registers the user aggregate and enforces its authenticated ownership", () =>
    Effect.gen(function* () {
      expect(system.name).toBe("qrk-sh");
      expect(system.aggregates.user["1.0.0"].actors.web.identity.pattern.source).toBe(
        "/:clerkUserId",
      );
      expect(Object.keys(system.aggregates.user)).toEqual(["1.0.0"]);
      const aggregate = system.aggregates.user["1.0.0"];
      expect(aggregate.models).toEqual(userSessionDefinition.models);
      expect(aggregate.contracts.createUser).toBe(createUser);
      expect(Object.keys(aggregate.actors.web.selections).sort()).toEqual([
        "brick",
        "page",
        "placement",
        "site",
        "user",
        "wall",
      ]);
      const dbConfig = makeResourceDbConfig({ models: aggregate.models });
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });
      const guard = userAggregateV1.guards.provisioner?.createUser;
      if (guard === undefined) throw new Error("Provisioner owner guard is required");
      const reads = makeContractReadDb({ db, models: aggregate.models });
      const rejected = yield* guard({
        db: reads,
        claims: { aggregateId: "acct_owner", clerkUserId: "owner" },
        payload: { id: "usr_other", clerkUserId: "other", username: null, displayName: null },
        failures: createUser.failures,
      }).pipe(Effect.flip);
      expect(rejected).toMatchObject({ code: "create-user-identity-mismatch", status: 403 });
      yield* guard({
        db: reads,
        claims: { aggregateId: "acct_owner", clerkUserId: "owner" },
        payload: {
          id: "usr_independent_owner",
          clerkUserId: "owner",
          username: null,
          displayName: null,
        },
        failures: createUser.failures,
      });
    }).pipe(Effect.scoped),
  );

  it.effect("rejects malformed signatures and invalid Clerk tokens", () =>
    Effect.gen(function* () {
      const malformed = yield* Schema.decodeUnknownEffect(signature)({ sessionToken: 123 }).pipe(
        Effect.result,
      );
      expect(malformed).toHaveProperty("failure");
      const authentication = system.aggregates.user["1.0.0"].actors.web.authentication;
      if (typeof authentication === "string") throw new Error("User actor must authenticate");
      const failure = yield* authentication
        .authenticate({
          aggregateId: "acct_invalid_token",
          credentials: { sessionToken: "invalid-token" },
        })
        .pipe(Effect.flip);
      expect(failure).toMatchObject({ code: "user-session-token-invalid", status: 401 });
    }).pipe(Effect.provide(NanoIdFactory)),
  );
});
