import { vi } from "vitest";
vi.mock("cloudflare:workers", () => ({
  env: {
    ZEROSPIN_API_URL: "https://zerospin.qrk.localhost",
    ZEROSPIN_SECRET_KEY: "test-only-secret",
  },
}));
vi.mock("@zerospin/core/utils/getSystemApi/getSystemApi", async () => {
  const { Effect } = await import("effect");
  return {
    getSystemApi: () =>
      Effect.succeed({ executeServiceQuery: () => Effect.succeed({ username: "testuser" }) }),
  };
});
import { it } from "@effect/vitest";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect } from "effect";
import { expect } from "vitest";

import { userAggregateV1 } from "../src/fresh/userAggregateV1";
import { system } from "../src/system";

it.effect(
  "stores one validated Image crop on the Brick and leaves Placement layouts and state intact",
  () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({ system });
      const owner = { release: userAggregateV1, aggregateId: "acct_image_crop" };
      const db = makeQueryDbVersion({ models: userAggregateV1.models });
      const actor = {
        aggregateName: userAggregateV1.name,
        aggregateVersion: userAggregateV1.version,
        aggregateId: owner.aggregateId,
        actorName: "web",
        actorVersion: 1,
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
        contractVersion: 1,
        pushIndex: 2,
        payload: {
          id: "pag_image_crop",
          siteId: "sit_image_crop",
          slug: null,
          title: null,
          description: null,
        },
      });
      const image = {
        imageUrl: "https://example.com/image.png",
        altText: "Photo",
        caption: "",
        crop: null,
        round: false,
      };
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: "cmd_image_crop_add",
        commandName: "addImageBrick",
        contractVersion: 1,
        pushIndex: 3,
        payload: {
          brickId: "brk_image_crop",
          pageId: "pag_image_crop",
          layoutId: "default",
          state: image,
          target: { kind: "wall", wallId: "wal_pag_image_crop_lg", beforeSectionId: null },
        },
      });
      yield* harness.flush();
      const brickQuery = db.query.brick.findFirst({ where: { id: { eq: "brk_image_crop" } } });
      expect((yield* harness.query(owner, brickQuery))?.state).toEqual(image);
      const placements = yield* harness.query(owner, db.query.placement.findMany({}));
      expect(placements).toHaveLength(4);
      const update = {
        ...actor,
        kind: "actor" as const,
        commandName: "updateImageBrick" as const,
        contractVersion: 1,
      };
      const crop = { x: 0.62, y: 0.41, zoom: 1.4 };
      yield* harness.push({
        ...update,
        id: "cmd_image_crop_save",
        pushIndex: 4,
        payload: { brickId: "brk_image_crop", state: { ...image, crop } },
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
            state: { ...image, crop: { ...crop, x: 2 } },
          },
        })
        .pipe(Effect.flip);
      expect((yield* harness.query(owner, brickQuery))?.state).toEqual({ ...image, crop });
    }).pipe(Effect.provide(NanoIdFactory)),
);
