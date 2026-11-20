import { expect, it } from "@effect/vitest";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import * as Effect from "effect/Effect";
import { usersV1 } from "../src/services/users/usersV1";
import { system } from "../src/system";

it.effect("keeps one global claim and preserves failed assignments after a successful rename", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    const common = {
      kind: "system",
      serviceName: "users",
      serviceVersion: 1,
      commandName: "assignUsername",
      contractVersion: 1,
      externalOutcome: null,
    } as const;
    const assigned = yield* harness.push({
      ...common,
      id: "cmd_username_one",
      payload: { userId: "usr_one", aggregateId: "account_one", username: "first" },
    });
    expect(assigned).toEqual({ status: "assigned", username: "first" });
    yield* harness.push({
      ...common,
      id: "cmd_username_two",
      payload: { userId: "usr_two", aggregateId: "account_two", username: "taken" },
    });
    const refused = yield* harness.push({
      ...common,
      id: "cmd_username_taken",
      payload: { userId: "usr_one", aggregateId: "account_one", username: "taken" },
    });
    expect(refused).toEqual({ status: "rejected", message: "That username is already taken" });
    const db = makeQueryDbVersion({ models: usersV1.models });
    const unchanged = yield* harness.query(
      { release: usersV1 },
      db.query.username.findFirst({ where: { userId: { eq: "usr_one" } } }),
    );
    expect(unchanged?.username).toBe("first");
    yield* harness.push({
      ...common,
      id: "cmd_username_taken_again",
      payload: { userId: "usr_one", aggregateId: "account_one", username: "taken" },
    });
    yield* harness.push({
      ...common,
      id: "cmd_username_rename",
      payload: { userId: "usr_one", aggregateId: "account_one", username: "renamed" },
    });
    yield* harness.push({
      ...common,
      id: "cmd_username_repeat",
      payload: { userId: "usr_one", aggregateId: "account_one", username: "renamed" },
    });
    const rows = yield* harness.query({ release: usersV1 }, db.query.username.findMany({}));
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.userId === "usr_one")?.username).toBe("renamed");
    const failures = yield* harness.query(
      { release: usersV1 },
      db.query.usernameFailure.findMany({}),
    );
    expect(failures).toHaveLength(2);
    expect(new Set(failures.map((row) => row.id)).size).toBe(2);
    expect(
      failures.every((row) => row.aggregateId === "account_one" && row.username === "taken"),
    ).toBe(true);
    const forged = yield* harness.push({
      ...common,
      id: "cmd_username_forged",
      payload: { userId: "usr_one", aggregateId: "account_two", username: "forged" },
    });
    expect(forged).toMatchObject({
      status: "rejected",
      message: "This user belongs to another account",
    });
    const invalid = yield* harness.push({
      ...common,
      id: "cmd_username_invalid",
      payload: { userId: "usr_one", aggregateId: "account_one", username: "invalid-name" },
    });
    expect(invalid).toMatchObject({ status: "rejected" });
  }).pipe(Effect.provide(NanoIdFactory)),
);
