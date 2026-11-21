import { vi } from "vitest";
vi.mock("cloudflare:workers", () => ({
  env: {
    ZEROSPIN_API_URL: "https://zerospin.qrk.localhost",
    ZEROSPIN_SECRET_KEY: "test-only-secret",
  },
}));
vi.mock("@zerospin/core/utils/getSystemApi/getSystemApi", async () => {
  const Effect = await import("effect/Effect");
  return {
    getSystemApi: () =>
      Effect.succeed({ executeServiceQuery: () => Effect.succeed({ username: "testuser" }) }),
  };
});
import { it } from "@effect/vitest";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import * as Effect from "effect/Effect";
import { expect } from "vitest";
import { userAggregateV1 } from "../src/fresh/userAggregateV1";
import { system } from "../src/system";

it.effect(
  "saves a single image, preserves slide order and crop, and rejects invalid carousel content",
  () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({ system });
      const owner = { release: userAggregateV1, aggregateId: "acct_carousel" };
      const db = makeQueryDbVersion({ models: owner.release.models });
      const actor = {
        kind: "actor" as const,
        aggregateName: "user",
        aggregateVersion: 1,
        aggregateId: owner.aggregateId,
        actorName: "web",
        actorVersion: 1,
        claims: { aggregateId: owner.aggregateId, clerkUserId: "user_carousel" },
        nodeId: "node_carousel",
        sessionName: "userSession",
        contractVersion: 1,
      };
      yield* harness.push({
        kind: "system",
        id: "cmd_carousel_user",
        commandName: "createUser",
        contractVersion: 1,
        aggregateName: "user",
        aggregateVersion: 1,
        aggregateId: owner.aggregateId,
        payload: { id: "usr_carousel", clerkUserId: "user_carousel", displayName: null },
      });
      yield* harness.flush();
      yield* harness.push({
        ...actor,
        id: "cmd_carousel_site",
        pushIndex: 1,
        commandName: "createSite",
        payload: {
          id: "sit_carousel",
          userId: "usr_carousel",
          slug: "carousel",
          name: null,
          description: null,
        },
      });
      yield* harness.push({
        ...actor,
        id: "cmd_carousel_page",
        pushIndex: 2,
        commandName: "createPage",
        payload: {
          id: "pag_carousel",
          siteId: "sit_carousel",
          slug: null,
          title: null,
          description: null,
        },
      });
      yield* harness.push({
        ...actor,
        id: "cmd_carousel_add",
        pushIndex: 3,
        commandName: "addImageCarouselBrick",
        payload: {
          brickId: "brk_carousel",
          pageId: "pag_carousel",
          state: null,
          target: { kind: "wall", wallId: "wal_pag_carousel_lg", beforeSectionId: null },
        },
      });
      const first = {
        id: "first",
        imageUrl: "https://example.com/first.png",
        alt: "First",
        crop: { x: 0.3, y: 0.6, zoom: 1.4 },
      };
      const second = {
        id: "second",
        imageUrl: "https://example.com/second.png",
        alt: "Second",
        crop: null,
      };
      yield* harness.push({
        ...actor,
        id: "cmd_carousel_single",
        pushIndex: 4,
        commandName: "updateImageCarouselBrick",
        payload: { brickId: "brk_carousel", state: { slides: [first], interval: 5 } },
      });
      yield* harness.flush();
      const query = db.query.brick.findFirst({ where: { id: { eq: "brk_carousel" } } });
      expect((yield* harness.query(owner, query))?.state).toEqual({ slides: [first], interval: 5 });
      const saved = { slides: [second, first], interval: 3 };
      yield* harness.push({
        ...actor,
        id: "cmd_carousel_reorder",
        pushIndex: 5,
        commandName: "updateImageCarouselBrick",
        payload: { brickId: "brk_carousel", state: saved },
      });
      const empty = yield* harness
        .push({
          ...actor,
          id: "cmd_carousel_empty",
          pushIndex: 6,
          commandName: "updateImageCarouselBrick",
          payload: { brickId: "brk_carousel", state: { slides: [], interval: 5 } },
        })
        .pipe(Effect.flip);
      expect(empty).toMatchObject({ code: "encode-command-payload-failed" });
      const interval = yield* harness
        .push({
          ...actor,
          id: "cmd_carousel_interval",
          pushIndex: 7,
          commandName: "updateImageCarouselBrick",
          payload: { brickId: "brk_carousel", state: { slides: [first], interval: 2 } },
        })
        .pipe(Effect.flip);
      expect(interval).toMatchObject({ code: "encode-command-payload-failed" });
      yield* harness.flush();
      expect((yield* harness.query(owner, query))?.state).toEqual(saved);
    }).pipe(Effect.provide(NanoIdFactory)),
);
