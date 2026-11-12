import { it } from "@effect/vitest";
import { decodeAndAdaptPayload } from "@zerospin/core/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload";
import { encodePayload } from "@zerospin/core/contracts/encodePayload";
import { DownAdapterRefused, makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect } from "effect";
import { expect } from "vitest";
import { userAggregateV15 } from "../src/aggregates/user/UserV15";
import { addBrickV7 } from "../src/aggregates/user/contracts/wall/AddBrickContractV7";
import { addBrickV8 } from "../src/aggregates/user/contracts/wall/AddBrickContractV8";
import { updateBrickV8 } from "../src/aggregates/user/contracts/brick/UpdateBrickV8";
import { updateBrickV9 } from "../src/aggregates/user/contracts/brick/UpdateBrickV9";
import { system } from "../src/system";

it.effect("adapts retained Brick commands and refuses the new module on older releases", () =>
  Effect.gen(function* () {
    const legacy = {
      id: "brk_carousel",
      pageId: "pag_carousel",
      moduleId: "image",
      state: null,
      target: { kind: "wall", wallId: "wal_pag_carousel_lg", beforeSectionId: null },
    } satisfies Parameters<typeof addBrickV7.evaluate>[0]["payload"];
    const oldPayload = yield* encodePayload(addBrickV7, { version: 7, payload: legacy });
    expect(yield* decodeAndAdaptPayload(addBrickV8, {
      command: { commandName: "addBrick", contractVersion: 7, payload: oldPayload },
    })).toEqual(legacy);
    const newPayload = yield* encodePayload(addBrickV8, {
      version: 8, payload: { ...legacy, moduleId: "image-carousel" },
    });
    expect(yield* decodeAndAdaptPayload(addBrickV7, {
      command: { commandName: "addBrick", contractVersion: 8, payload: newPayload },
    }).pipe(Effect.flip)).toBe(DownAdapterRefused);
    const update = yield* encodePayload(updateBrickV9, {
      version: 9, payload: { brickId: "brk_carousel", moduleId: "image-carousel", state: null },
    });
    expect(yield* decodeAndAdaptPayload(updateBrickV8, {
      command: { commandName: "updateBrick", contractVersion: 9, payload: update },
    }).pipe(Effect.flip)).toBe(DownAdapterRefused);
  }),
);

it.effect("registers the candidate and creates a user through its System command", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    const aggregateId = "acct_carousel_candidate";
    yield* harness.push({
      kind: "system", id: "cmd_carousel_create_user", commandName: "createUser", contractVersion: 1,
      aggregateName: "user", aggregateVersion: 15, aggregateId, externalOutcome: null,
      payload: { id: "usr_carousel", clerkUserId: "user_carousel", username: null, displayName: null },
    });
    yield* harness.flush();
    const db = makeQueryDbVersion({ models: userAggregateV15.models });
    expect(yield* harness.query({ release: userAggregateV15, aggregateId },
      db.query.user.findFirst({ where: { id: { eq: "usr_carousel" } } })))
      .toMatchObject({ clerkUserId: "user_carousel" });
  }).pipe(Effect.provide(NanoIdFactory)),
);
