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
import { expect, it } from "@effect/vitest";
import { freshCandidateLibrary } from "@qrk.sh/bricks/modules/candidateLibrary";
import { swatchAndIconPreviewState } from "@qrk.sh/bricks/modules/swatchAndIcon/definition/swatchAndIconPreviewState";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect, Schema } from "effect";
import { system } from "../src/system";
import { userAggregateV1 } from "../src/fresh/userAggregateV1";

it.effect("requires a complete swatch while allowing the default empty hash", () =>
  Effect.sync(() => {
    const isComplete = Schema.is(freshCandidateLibrary["swatch-and-icon"].completeStateSchema);
    expect(isComplete(swatchAndIconPreviewState)).toBe(true);
    expect(
      isComplete({ ...swatchAndIconPreviewState, payload: { hash: "", color: "not-a-color" } }),
    ).toBe(false);
    expect(isComplete({ ...swatchAndIconPreviewState, data: { name: "", svg: "" } })).toBe(false);
  }),
);

it.effect(
  "keeps the chosen Image layout across all Placements and rejects invalid Image content",
  () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({ system });
      yield* harness.push({
        kind: "system",
        id: "cmd_drawer_user",
        commandName: "createUser",
        contractVersion: 1,
        aggregateName: "user",
        aggregateVersion: 1,
        aggregateId: "acct_drawer",
        externalOutcome: null,
        payload: { id: "usr_drawer", clerkUserId: "user_drawer", displayName: null },
      });
      const actor = {
        kind: "actor" as const,
        actorName: "web",
        actorVersion: 1,
        contractVersion: 1,
        aggregateName: "user",
        aggregateVersion: 1,
        aggregateId: "acct_drawer",
        nodeId: "node_drawer",
        sessionName: "userSession",
        externalOutcome: null,
        claims: { aggregateId: "acct_drawer", clerkUserId: "user_drawer" },
      };
      yield* harness.push({
        ...actor,
        id: "cmd_drawer_site",
        pushIndex: 1,
        commandName: "createSite",
        payload: {
          id: "sit_drawer",
          userId: "usr_drawer",
          slug: "drawer",
          name: null,
          description: null,
        },
      });
      yield* harness.push({
        ...actor,
        id: "cmd_drawer_page",
        pushIndex: 2,
        commandName: "createPage",
        payload: {
          id: "pag_drawer",
          siteId: "sit_drawer",
          slug: null,
          title: null,
          description: null,
        },
      });
      const roundState = {
        imageUrl: "https://example.test/lake.jpg",
        altText: "Mountain lake",
        caption: "",
        crop: null,
        round: true,
      };
      yield* harness.push({
        ...actor,
        id: "cmd_drawer_image",
        pushIndex: 3,
        commandName: "addImageBrick",
        payload: {
          brickId: "brk_drawer",
          pageId: "pag_drawer",
          layoutId: "captionless",
          state: roundState,
          target: { kind: "wall", wallId: "wal_pag_drawer_lg", beforeSectionId: null },
        },
      });
      yield* harness.flush();
      const db = makeQueryDbVersion({ models: userAggregateV1.models });
      const owner = { release: userAggregateV1, aggregateId: "acct_drawer" };
      const placements = yield* harness.query(
        owner,
        db.query.placement.findMany({ where: { brickId: { eq: "brk_drawer" } } }),
      );
      expect(placements).toHaveLength(4);
      expect(placements.every((placement) => placement.layoutId === "captionless")).toBe(true);
      const invalidRound = yield* harness
        .push({
          ...actor,
          id: "cmd_drawer_invalid_round",
          pushIndex: 4,
          commandName: "updateImageBrick",
          payload: { brickId: "brk_drawer", state: { ...roundState, caption: "Caption" } },
        })
        .pipe(Effect.flip);
      expect(invalidRound).toMatchObject({ code: "encode-command-payload-failed" });
      const invalidAlt = yield* harness
        .push({
          ...actor,
          id: "cmd_drawer_invalid_alt",
          pushIndex: 5,
          commandName: "updateImageBrick",
          payload: { brickId: "brk_drawer", state: { ...roundState, altText: "" } },
        })
        .pipe(Effect.flip);
      expect(invalidAlt).toMatchObject({ code: "encode-command-payload-failed" });
      const rectangle = { ...roundState, round: false, caption: "Caption" };
      yield* harness.push({
        ...actor,
        id: "cmd_drawer_update",
        pushIndex: 6,
        commandName: "updateImageBrick",
        payload: { brickId: "brk_drawer", state: rectangle },
      });
      yield* harness.flush();
      expect(
        yield* harness.query(
          owner,
          db.query.brick.findFirst({ where: { id: { eq: "brk_drawer" } } }),
        ),
      ).toMatchObject({ state: rectangle });
      const after = yield* harness.query(
        owner,
        db.query.placement.findMany({ where: { brickId: { eq: "brk_drawer" } } }),
      );
      expect(after.map((placement) => placement.layoutId)).toEqual(
        placements.map((placement) => placement.layoutId),
      );
    }).pipe(Effect.provide(NanoIdFactory)),
);
