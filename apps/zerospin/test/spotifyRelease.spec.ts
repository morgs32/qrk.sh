import { it } from "@effect/vitest";
import { decodeAndAdaptPayload } from "@zerospin/core/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload";
import { encodePayload } from "@zerospin/core/contracts/encodePayload";
import { DownAdapterRefused, makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect } from "effect";
import { expect } from "vitest";
import { userAggregateV17 } from "../src/aggregates/user/UserV17";
import { addBrickV9 } from "../src/aggregates/user/contracts/wall/AddBrickContractV9";
import { addBrickV10 } from "../src/aggregates/user/contracts/wall/AddBrickContractV10";
import { updateBrickV10 } from "../src/aggregates/user/contracts/brick/UpdateBrickV10";
import { updateBrickV11 } from "../src/aggregates/user/contracts/brick/UpdateBrickV11";
import { system } from "../src/system";

it.effect("adapts retained Brick commands and refuses Spotify on the preceding release", () =>
  Effect.gen(function* () {
    const legacy = {
      id: "brk_spotify",
      pageId: "pag_spotify",
      moduleId: "image",
      state: null,
      target: { kind: "wall", wallId: "wal_pag_spotify_lg", beforeSectionId: null },
    } satisfies Parameters<typeof addBrickV9.evaluate>[0]["payload"];
    const oldPayload = yield* encodePayload(addBrickV9, { version: 9, payload: legacy });
    expect(yield* decodeAndAdaptPayload(addBrickV10, {
      command: { commandName: "addBrick", contractVersion: 9, payload: oldPayload },
    })).toEqual(legacy);
    const newPayload = yield* encodePayload(addBrickV10, {
      version: 10, payload: { ...legacy, moduleId: "spotify" },
    });
    expect(yield* decodeAndAdaptPayload(addBrickV9, {
      command: { commandName: "addBrick", contractVersion: 10, payload: newPayload },
    }).pipe(Effect.flip)).toBe(DownAdapterRefused);
    const update = yield* encodePayload(updateBrickV11, {
      version: 11, payload: { brickId: "brk_spotify", moduleId: "spotify", state: null },
    });
    expect(yield* decodeAndAdaptPayload(updateBrickV10, {
      command: { commandName: "updateBrick", contractVersion: 11, payload: update },
    }).pipe(Effect.flip)).toBe(DownAdapterRefused);
  }),
);

it.effect("registers the candidate and creates a user through its System command", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    const aggregateId = "acct_spotify_candidate";
    yield* harness.push({
      kind: "system", id: "cmd_spotify_create_user", commandName: "createUser", contractVersion: 1,
      aggregateName: "user", aggregateVersion: 17, aggregateId, externalOutcome: null,
      payload: { id: "usr_spotify", clerkUserId: "user_spotify", username: null, displayName: null },
    });
    yield* harness.flush();
    const db = makeQueryDbVersion({ models: userAggregateV17.models });
    expect(yield* harness.query({ release: userAggregateV17, aggregateId },
      db.query.user.findFirst({ where: { id: { eq: "usr_spotify" } } })))
      .toMatchObject({ clerkUserId: "user_spotify" });
  }).pipe(Effect.provide(NanoIdFactory)),
);
