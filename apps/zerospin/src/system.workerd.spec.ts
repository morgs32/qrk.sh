import { it } from "@effect/vitest";
import { AsyncLive } from "@zerospin/core/async/AsyncLive";
import { makeResourceDbConfig } from "@zerospin/core/drizzle/makeDbConfig";
import { makeProvisionedInMemoryWasmSqliteDb } from "@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb";
import { makeAggregateId } from "@zerospin/sdk";
import { Effect, Schema } from "effect";
import { describe, expect } from "vitest";

import { userFrontend } from "./accounts/user/actors/user/userFrontend";
import { createUser } from "./contracts";
import { signature } from "./signature";
import { system } from "./system";

describe("QRK system", () => {
  it.effect("registers the user aggregate and enforces its authenticated ownership", () =>
    Effect.gen(function* () {
      expect(system.name).toBe("qrk-sh");
      expect(system.authentication.map((entry) => entry.version)).toEqual(["1.0.0"]);
      expect(Object.keys(system.aggregates.user)).toEqual(["3.0.0"]);
      const aggregate = system.aggregates.user["3.0.0"];
      expect(aggregate.models).toEqual(userFrontend.models);
      expect(aggregate.contracts.createUser.contract).toBe(createUser);
      expect(Object.keys(aggregate.selections).sort()).toEqual([
        "brick",
        "grid",
        "page",
        "site",
        "user",
      ]);
      if (aggregate.authorize === undefined) {
        throw new Error("Expected user aggregate authorization");
      }
      const dbConfig = makeResourceDbConfig({ models: aggregate.models });
      const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      );
      yield* aggregate.authorize({
        db,
        userId: "owner",
        aggregateId: makeAggregateId({ id: "owner" }),
      });
      const failure = yield* aggregate
        .authorize({ db, userId: "other", aggregateId: makeAggregateId({ id: "owner" }) })
        .pipe(Effect.flip);
      expect(failure).toMatchObject({ code: "user-aggregate-mismatch", status: 403 });

      // Both owners initialize the same contract guard for command admission.
      const backendGuards = yield* aggregate.initializeGuards;
      const frontendGuards = yield* userFrontend.initializeGuards;
      for (const guards of [backendGuards, frontendGuards]) {
        const rejected = yield* guards
          .run("createUser", {
            db,
            userId: "owner",
            payload: { id: "usr_other", clerkUserId: "other", username: null, displayName: null },
          })
          .pipe(Effect.flip);
        expect(rejected).toMatchObject({ code: "create-user-identity-mismatch", status: 403 });
        yield* guards.run("createUser", {
          db,
          userId: "owner",
          payload: { id: "usr_owner", clerkUserId: "owner", username: null, displayName: null },
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
      const authentication = system.authentication[0];
      const failure = yield* authentication
        .authenticate({ signature: { sessionToken: "invalid-token" } })
        .pipe(Effect.flip);
      expect(failure).toMatchObject({ code: "user-session-token-invalid", status: 401 });
    }),
  );
});
