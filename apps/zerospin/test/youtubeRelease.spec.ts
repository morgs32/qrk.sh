import { it } from "@effect/vitest";
import { decodeAndAdaptPayload } from "@zerospin/core/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload";
import { encodePayload } from "@zerospin/core/contracts/encodePayload";
import { DownAdapterRefused, makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect } from "effect";
import { expect } from "vitest";
import { userAggregateV19 } from "../src/aggregates/user/UserV19";
import { addBrickV11 } from "../src/aggregates/user/contracts/wall/AddBrickContractV11";
import { addBrickV12 } from "../src/aggregates/user/contracts/wall/AddBrickContractV12";
import { updateBrickV12 } from "../src/aggregates/user/contracts/brick/UpdateBrickV12";
import { updateBrickV13 } from "../src/aggregates/user/contracts/brick/UpdateBrickV13";
import { system } from "../src/system";

it.effect("adapts retained Brick commands and refuses YouTube on the preceding release", () =>
  Effect.gen(function* () {
    const legacy = {
      id: "brk_youtube",
      pageId: "pag_youtube",
      moduleId: "spotify",
      layoutId: "default",
      state: null,
      target: { kind: "wall", wallId: "wal_pag_youtube_lg", beforeSectionId: null },
    } satisfies Parameters<typeof addBrickV11.evaluate>[0]["payload"];
    const oldPayload = yield* encodePayload(addBrickV11, { version: 11, payload: legacy });
    expect(yield* decodeAndAdaptPayload(addBrickV12, {
      command: { commandName: "addBrick", contractVersion: 11, payload: oldPayload },
    })).toEqual(legacy);
    const nextPayload = yield* encodePayload(addBrickV12, {
      version: 12, payload: { ...legacy, moduleId: "youtube" },
    });
    expect(yield* decodeAndAdaptPayload(addBrickV11, {
      command: { commandName: "addBrick", contractVersion: 12, payload: nextPayload },
    }).pipe(Effect.flip)).toBe(DownAdapterRefused);
    const update = yield* encodePayload(updateBrickV13, {
      version: 13, payload: { brickId: "brk_youtube", moduleId: "youtube", state: null },
    });
    expect(yield* decodeAndAdaptPayload(updateBrickV12, {
      command: { commandName: "updateBrick", contractVersion: 13, payload: update },
    }).pipe(Effect.flip)).toBe(DownAdapterRefused);
  }),
);

it.effect("registers the candidate and creates a user through its System command", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    const aggregateId = "acct_youtube_candidate";
    yield* harness.push({
      kind: "system", id: "cmd_youtube_create_user", commandName: "createUser", contractVersion: 1,
      aggregateName: "user", aggregateVersion: 19, aggregateId, externalOutcome: null,
      payload: { id: "usr_youtube", clerkUserId: "user_youtube", username: null, displayName: null },
    });
    yield* harness.flush();
    const db = makeQueryDbVersion({ models: userAggregateV19.models });
    expect(yield* harness.query({ release: userAggregateV19, aggregateId },
      db.query.user.findFirst({ where: { id: { eq: "usr_youtube" } } })))
      .toMatchObject({ clerkUserId: "user_youtube" });
  }).pipe(Effect.provide(NanoIdFactory)),
);
