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
import { pageSnapshotSchema } from "@qrk.sh/bricks/zerospin/models/pageSnapshot/pageSnapshotSchema";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { expect } from "vitest";
import { userAggregateV1 } from "../src/fresh/userAggregateV1";
import { system } from "../src/system";

it.effect("saves and snapshots both portfolio Bricks", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    const owner = { release: userAggregateV1, aggregateId: "acct_portfolio_bricks" };
    const db = makeQueryDbVersion({ models: owner.release.models });
    const actor = {
      kind: "actor" as const,
      aggregateName: "user",
      aggregateVersion: 1,
      aggregateId: owner.aggregateId,
      actorName: "web",
      actorVersion: 1,
      claims: { aggregateId: owner.aggregateId, clerkUserId: "user_portfolio_bricks" },
      nodeId: "node_portfolio_bricks",
      sessionName: "userSession",
      contractVersion: 1,
    };
    yield* harness.push({
      kind: "system",
      id: "cmd_portfolio_create_user",
      commandName: "createUser",
      contractVersion: 1,
      aggregateName: "user",
      aggregateVersion: 1,
      aggregateId: owner.aggregateId,
      payload: { id: "usr_portfolio", clerkUserId: actor.claims.clerkUserId, displayName: null },
    });
    yield* harness.flush();
    yield* harness.push({
      ...actor,
      id: "cmd_portfolio_create_site",
      pushIndex: 1,
      commandName: "createSite",
      payload: {
        id: "sit_portfolio",
        userId: "usr_portfolio",
        slug: "portfolio",
        name: null,
        description: null,
      },
    });
    yield* harness.push({
      ...actor,
      id: "cmd_portfolio_create_page",
      pushIndex: 2,
      commandName: "createPage",
      payload: {
        id: "pag_portfolio",
        siteId: "sit_portfolio",
        slug: null,
        title: null,
        description: null,
      },
    });

    const fixtures = [
      {
        moduleId: "behance",
        add: "addBehanceBrick",
        update: "updateBehanceBrick",
        state: {
          payload: { url: "https://www.behance.net/example" },
          data: {
            displayName: "Example Studio",
            projects: [
              {
                id: "123",
                title: "Identity",
                url: "https://www.behance.net/gallery/123/Identity",
                coverUrl: "https://mir-s3-cdn-cf.behance.net/projects/808/example.jpg",
              },
            ],
          },
        },
      },
      {
        moduleId: "buy-me-a-coffee",
        add: "addBuyMeACoffeeBrick",
        update: "updateBuyMeACoffeeBrick",
        state: {
          payload: { url: "https://buymeacoffee.com/example", message: "Thanks for your support." },
        },
      },
    ];
    let pushIndex = 3;
    for (const fixture of fixtures) {
      const { moduleId, state, add, update } = fixture;
      const brickId: `brk_${string}` = `brk_portfolio_${moduleId}`;
      yield* harness.push({
        ...actor,
        id: `cmd_add_${moduleId}`,
        pushIndex: pushIndex++,
        commandName: add,
        payload: {
          brickId,
          pageId: "pag_portfolio",
          state: null,
          target: { kind: "wall", wallId: "wal_pag_portfolio_lg", beforeSectionId: null },
        },
      });
      yield* harness.push({
        ...actor,
        id: `cmd_save_${moduleId}`,
        pushIndex: pushIndex++,
        commandName: update,
        payload: { brickId, state },
      });
      const rejected = yield* harness
        .push({
          ...actor,
          id: `cmd_reject_${moduleId}`,
          pushIndex: pushIndex++,
          commandName: update,
          payload: {
            brickId,
            state: { ...state, payload: { ...state.payload, url: "https://example.com/invalid" } },
          },
        })
        .pipe(Effect.flip);
      expect(rejected).toMatchObject({ code: "encode-command-payload-failed" });
      expect(
        (yield* harness.query(owner, db.query.brick.findFirst({ where: { id: { eq: brickId } } })))
          ?.state,
      ).toEqual(state);
    }
    yield* harness.flush();
    yield* harness.push({
      ...actor,
      id: "cmd_portfolio_publish",
      pushIndex,
      commandName: "publishSite",
      payload: {
        siteId: "sit_portfolio",
        pages: [{ pageId: "pag_portfolio", snapshotId: "psn_portfolio" }],
        preferredRowSizing: true,
        preferredStackSizing: true,
      },
    });
    yield* harness.flush();
    const saved = yield* harness.query(
      owner,
      db.query.pageSnapshot.findFirst({ where: { id: { eq: "psn_portfolio" } } }),
    );
    const snapshot = Schema.decodeUnknownSync(pageSnapshotSchema)(saved?.content);
    expect(snapshot.rowSizing).toBe("preferred");
    expect(snapshot.bricks).toHaveLength(2);
    for (const fixture of fixtures)
      expect(snapshot.bricks).toContainEqual(
        expect.objectContaining({ moduleId: fixture.moduleId, brickState: fixture.state }),
      );
    expect(snapshot.walls).toHaveLength(4);
  }).pipe(Effect.provide(NanoIdFactory)),
);
