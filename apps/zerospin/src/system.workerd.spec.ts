import { makeEffectSchema } from "@zerospin/schema";
import { makeAggregateCommand } from "@zerospin/core/aggregate/makeAggregateCommand";
import { encodeCommand } from "@zerospin/core/contracts/encodeCommand";
import { it } from "@effect/vitest";
import { initializeGuards as initializeAggregateGuards } from "@zerospin/core/aggregate/initializeGuards";
import { AsyncLive } from "@zerospin/core/async/AsyncLive";
import { makeAsync } from "@zerospin/core/async/makeAsync";
import { makeResourceDbConfig } from "@zerospin/core/drizzle/makeDbConfig";
import { makeProvisionedInMemoryWasmSqliteDb } from "@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb";
import { initializeGuards as initializeFrontendGuards } from "@zerospin/core/frontendController/initializeGuards";
import { makeAggregateId } from "@zerospin/sdk";
import { ZerospinError } from "@zerospin/sdk";
import { NanoIdFactory } from "@zerospin/core/utils/NanoIdFactory";
import { decodeRpc } from "@zerospin/core/utils/decodeRpc";
import { makeSystemSpec } from "@zerospin/core/system/makeSystemSpec";
import { AggregateChain, SystemRepo, VersionedAggregateRepo } from "system-worker";
import { getTableName } from "drizzle-orm";
import { DateTime, Effect, Schema } from "effect";
import { describe, expect, vi, beforeAll } from "vitest";

import { userFrontend } from "./aggregates/user/userFrontend";
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
        const { userV8 } = yield* Effect.promise(() => import("./aggregates/user/UserV8"));
        const authenticate = userV8.authentication.authenticate;
        const systemRepo = yield* SystemRepo.getRepo({ key: { systemId: "sys_qrk_sh_1" } });
        yield* makeAsync<Awaited<ReturnType<SystemRepo["checkSystemSpec"]>>>(() =>
          systemRepo.checkSystemSpec({ spec: makeSystemSpec({ system }) }),
        ).pipe(Effect.flatMap(decodeRpc));
        for (const loseFirstResponse of [true, false]) {
          const clerkUserId = loseFirstResponse
            ? "user_provisioning_retry"
            : "user_provisioning_concurrent";
          const key = {
            systemId: "sys_qrk_sh_1",
            aggregateId: makeAggregateId({ id: clerkUserId }),
            aggregateName: "user",
            aggregateVersion: "8.0.0",
          };
          const chain = yield* AggregateChain.getRepo({ key });
          const attempts: { id: string; failureCode: string | null }[] = [];
          let loseResponse = loseFirstResponse;
          const executeCommand: Parameters<typeof authenticate>[0]["executeCommand"] = Effect.fn(
            "test.executeAuthenticationCommand",
          )(function* (props) {
            const command = yield* makeAggregateCommand({
              contract: createUser,
              aggregateId: key.aggregateId,
              aggregateName: "user",
              aggregateVersion: "8.0.0",
              systemName: "qrk-sh",
              payload: yield* Schema.decodeUnknownEffect(makeEffectSchema(createUser.payload))(
                props.payload,
              ).pipe(
                Effect.mapError(
                  (cause) =>
                    new ZerospinError({ code: "test-invalid-payload", message: String(cause) }),
                ),
              ),
            });
            const encoded = yield* encodeCommand({ contract: props.contract, command });
            // Provisioning crosses the trusted command boundary with null authentication.
            const result = yield* makeAsync<
              Awaited<ReturnType<AggregateChain["executeAggregateCommand"]>>
            >(() =>
              chain.executeAggregateCommand({
                aggregateVersion: key.aggregateVersion,
                command: encoded,
              }),
            ).pipe(Effect.flatMap(decodeRpc));
            attempts.push({ id: command.id, failureCode: result.failure?.code ?? null });
            if (loseResponse) {
              loseResponse = false;
              return yield* new ZerospinError({
                code: "test-response-lost",
                message: "Response lost after commit",
              });
            }
            return result;
          });

          if (loseFirstResponse) {
            const lost = yield* authenticate({
              signature: { sessionToken: clerkUserId },
              executeCommand,
            }).pipe(Effect.flip);
            expect(lost.code).toBe("test-response-lost");
            expect(attempts[0]?.failureCode).toBeNull();
          }

          yield* Effect.all(
            [
              authenticate({ signature: { sessionToken: clerkUserId }, executeCommand }),
              authenticate({ signature: { sessionToken: clerkUserId }, executeCommand }),
              authenticate({ signature: { sessionToken: clerkUserId }, executeCommand }),
            ],
            { concurrency: "unbounded" },
          );
          expect(new Set(attempts.map((attempt) => attempt.id)).size).toBe(
            loseFirstResponse ? 4 : 3,
          );
          expect(attempts.filter((attempt) => attempt.failureCode === null)).toHaveLength(1);
          expect(
            attempts.filter((attempt) => attempt.failureCode === "user-already-exists"),
          ).toHaveLength(loseFirstResponse ? 3 : 2);

          const repo = yield* VersionedAggregateRepo.getRepo({ key });
          const dbConfig = makeResourceDbConfig({ models: userFrontend.models });
          const users = yield* makeAsync<
            Awaited<ReturnType<VersionedAggregateRepo["executeSelectQuery"]>>
          >(() =>
            repo.executeSelectQuery({
              query: {
                rawSql: `SELECT "${dbConfig.schema.user.id.name}" AS "id", "${dbConfig.schema.user.clerkUserId.name}" AS "clerkUserId" FROM "${getTableName(dbConfig.schema.user)}"`,
                params: [],
                method: "all",
              },
            }),
          ).pipe(
            Effect.flatMap(decodeRpc),
            Effect.flatMap(
              Schema.decodeUnknownEffect(
                Schema.Array(Schema.Struct({ id: Schema.String, clerkUserId: Schema.String })),
              ),
            ),
          );
          expect(users).toHaveLength(1);
          expect(users[0]?.clerkUserId).toBe(clerkUserId);
          expect(users[0]?.id).toMatch(/^usr_/);
          expect(users[0]?.id).not.toBe(`usr_${clerkUserId}`);
        }
      }).pipe(Effect.provide(AsyncLive), Effect.provide(NanoIdFactory)),
  );

  it.effect("fails provisioning for terminal command errors other than an existing user", () =>
    Effect.gen(function* () {
      const { userV8 } = yield* Effect.promise(() => import("./aggregates/user/UserV8"));
      const authenticate = userV8.authentication.authenticate;
      const now = DateTime.toDateUtc(yield* DateTime.now);
      const failure = yield* authenticate({
        signature: { sessionToken: "user_rejected_provisioning" },
        executeCommand: (props) =>
          Effect.gen(function* () {
            const command = yield* makeAggregateCommand({
              contract: createUser,
              payload: yield* Schema.decodeUnknownEffect(makeEffectSchema(createUser.payload))(
                props.payload,
              ).pipe(
                Effect.mapError(
                  (cause) =>
                    new ZerospinError({ code: "test-invalid-payload", message: String(cause) }),
                ),
              ),
              aggregateId: "acct_user_rejected_provisioning",
              aggregateName: "user",
              aggregateVersion: "8.0.0",
              systemName: "qrk-sh",
            });
            const encoded = yield* encodeCommand({ contract: createUser, command });
            return {
              ...encoded,
              aggregateIndex: 1,
              chainedAt: now,
              dispositionHash: "a".repeat(64),
              delta: null,
              failedAt: now,
              failure: {
                code: "create-user-identity-mismatch",
                message: "Wrong identity",
                status: 403,
                cause: null,
                extra: null,
              },
            };
          }),
      }).pipe(Effect.flip);
      expect(failure.code).toBe("create-user-identity-mismatch");
    }).pipe(Effect.provide(AsyncLive), Effect.provide(NanoIdFactory)),
  );

  it.effect("registers the user aggregate and enforces its authenticated ownership", () =>
    Effect.gen(function* () {
      expect(system.name).toBe("qrk-sh");
      expect(system.aggregates.user["8.0.0"].authentication.pattern.source).toBe("/:clerkUserId");
      expect(Object.keys(system.aggregates.user)).toEqual(["8.0.0"]);
      const aggregate = system.aggregates.user["8.0.0"];
      expect(aggregate.models).toEqual(userFrontend.models);
      expect(aggregate.contracts.createUser.contract).toBe(createUser);
      expect(Object.keys(aggregate.selections).sort()).toEqual([
        "brick",
        "grid",
        "page",
        "site",
        "user",
      ]);
      const dbConfig = makeResourceDbConfig({ models: aggregate.models });
      const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      );
      // Both owners initialize the same contract guard for command admission.
      const backendGuards = yield* initializeAggregateGuards(aggregate);
      const frontendGuards = yield* initializeFrontendGuards(userFrontend);
      for (const guards of [backendGuards, frontendGuards]) {
        const rejected = yield* guards
          .run("createUser", {
            db,
            authentication: { aggregateId: "acct_owner", clerkUserId: "owner" },
            payload: { id: "usr_other", clerkUserId: "other", username: null, displayName: null },
          })
          .pipe(Effect.flip);
        expect(rejected).toMatchObject({ code: "create-user-identity-mismatch", status: 403 });
        yield* guards.run("createUser", {
          db,
          authentication: { aggregateId: "acct_owner", clerkUserId: "owner" },
          payload: {
            id: "usr_independent_owner",
            clerkUserId: "owner",
            username: null,
            displayName: null,
          },
        });
      }
    }).pipe(Effect.scoped),
  );

  it.effect("rejects malformed signatures and invalid Clerk tokens", () =>
    Effect.gen(function* () {
      const malformed = yield* Schema.decodeUnknownEffect(signature)({ sessionToken: 123 }).pipe(
        Effect.result,
      );
      expect(malformed._tag).toBe("Failure");
      const authentication = system.aggregates.user["8.0.0"].authentication;
      const failure = yield* authentication
        .authenticate({
          signature: { sessionToken: "invalid-token" },
          executeCommand: () => Effect.die("Invalid token must not execute commands"),
        })
        .pipe(Effect.flip);
      expect(failure).toMatchObject({ code: "user-session-token-invalid", status: 401 });
    }).pipe(Effect.provide(AsyncLive), Effect.provide(NanoIdFactory)),
  );
});
