import { it } from "@effect/vitest";
import { imageStateSchema } from "@qrk.sh/bricks/modules/image/definition/v2";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect, Schema } from "effect";
import { expect } from "vitest";

import { userAggregateV11 } from "../src/aggregates/user/UserV11";
import { system } from "../src/system";

it.effect("stores one validated Image crop on the Brick and leaves Placement specs intact", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    const owner = { release: userAggregateV11, aggregateId: "acct_image_crop" };
    const db = makeQueryDbVersion({ models: userAggregateV11.models });
    const actor = {
      aggregateName: userAggregateV11.name,
      aggregateVersion: userAggregateV11.version,
      aggregateId: owner.aggregateId,
      actorName: "web",
      actorVersion: 11,
      claims: { aggregateId: owner.aggregateId, clerkUserId: "user_image_crop" },
      externalOutcome: null,
      nodeId: "node_image_crop",
      sessionName: "userSession",
    };
    yield* harness.push({
      kind: "system",
      id: "cmd_image_crop_create_user",
      commandName: "createUser",
      contractVersion: 1,
      aggregateName: actor.aggregateName,
      aggregateVersion: actor.aggregateVersion,
      aggregateId: owner.aggregateId,
      externalOutcome: null,
      payload: {
        id: "usr_image_crop",
        clerkUserId: actor.claims.clerkUserId,
        username: null,
        displayName: null,
      },
    });
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_image_crop_create_site",
      commandName: "createSite",
      contractVersion: 1,
      pushIndex: 1,
      payload: {
        id: "sit_image_crop",
        userId: "usr_image_crop",
        slug: "crop",
        name: null,
        description: null,
      },
    });
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_image_crop_create_page",
      commandName: "createPage",
      contractVersion: 3,
      pushIndex: 2,
      payload: {
        id: "pag_image_crop",
        siteId: "sit_image_crop",
        slug: null,
        title: null,
        description: null,
      },
    });
    const image = { imageUrl: "https://example.com/image.png", title: "Photo" };
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_image_crop_add",
      commandName: "addBrick",
      contractVersion: 6,
      pushIndex: 3,
      payload: {
        id: "brk_image_crop",
        pageId: "pag_image_crop",
        moduleId: "image",
        state: image,
        target: { kind: "wall", wallId: "wal_pag_image_crop_lg", beforeSectionId: null },
      },
    });
    yield* harness.flush();
    const brickQuery = db.query.brick.findFirst({ where: { id: { eq: "brk_image_crop" } } });
    const readState = Schema.decodeUnknownSync(imageStateSchema);
    expect(readState((yield* harness.query(owner, brickQuery))?.state)).toEqual({
      ...image,
      crop: null,
    });
    const placements = yield* harness.query(owner, db.query.placement.findMany({}));
    expect(placements).toHaveLength(4);
    const update = {
      ...actor,
      kind: "actor" as const,
      commandName: "updateBrick" as const,
      contractVersion: 6,
    };
    const crop = { x: 0.62, y: 0.41, zoom: 1.4 };
    yield* harness.push({
      ...update,
      id: "cmd_image_crop_save",
      pushIndex: 4,
      payload: { brickId: "brk_image_crop", moduleId: "image", state: { ...image, crop } },
    });
    yield* harness.flush();
    expect((yield* harness.query(owner, brickQuery))?.state).toEqual({ ...image, crop });
    expect(yield* harness.query(owner, db.query.placement.findMany({}))).toEqual(placements);
    yield* harness
      .push({
        ...update,
        id: "cmd_image_crop_invalid",
        pushIndex: 5,
        payload: {
          brickId: "brk_image_crop",
          moduleId: "image",
          state: { ...image, crop: { ...crop, x: 2 } },
        },
      })
      .pipe(Effect.flip);
    expect((yield* harness.query(owner, brickQuery))?.state).toEqual({ ...image, crop });
  }).pipe(Effect.provide(NanoIdFactory)),
);
