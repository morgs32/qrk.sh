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
import { expect, it } from "@effect/vitest";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import * as Effect from "effect/Effect";
import { userAggregateV1 } from "../src/fresh/userAggregateV1";
import { system } from "../src/system";

it.effect("creates a user in the isolated fresh owner", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    yield* harness.push({
      kind: "system",
      id: "cmd_fresh_user",
      commandName: "createUser",
      contractVersion: 1,
      aggregateName: "user",
      aggregateVersion: 1,
      aggregateId: "acct_fresh",
      payload: { id: "usr_fresh", clerkUserId: "user_fresh", displayName: null },
    });
    yield* harness.flush();
    const db = makeQueryDbVersion({ models: userAggregateV1.models });
    expect(
      yield* harness.query(
        { release: userAggregateV1, aggregateId: "acct_fresh" },
        db.query.user.findFirst({ where: { id: { eq: "usr_fresh" } } }),
      ),
    ).toMatchObject({ clerkUserId: "user_fresh" });
  }).pipe(Effect.provide(NanoIdFactory)),
);

it.effect("adds Text atomically and changes only the selected Placement", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    yield* harness.push({
      kind: "system",
      id: "cmd_text_user",
      commandName: "createUser",
      contractVersion: 1,
      aggregateName: "user",
      aggregateVersion: 1,
      aggregateId: "acct_text",
      payload: { id: "usr_text", clerkUserId: "user_text", displayName: null },
    });
    yield* harness.flush();
    const actor = {
      kind: "actor",
      actorName: "web",
      actorVersion: 1,
      aggregateName: "user",
      aggregateVersion: 1,
      aggregateId: "acct_text",
      nodeId: "node_text",
      sessionName: "userSession",
      contractVersion: 1,
      claims: { aggregateId: "acct_text", clerkUserId: "user_text" },
    } as const;
    yield* harness.push({
      ...actor,
      id: "cmd_text_site",
      pushIndex: 1,
      commandName: "createSite",
      payload: {
        id: "sit_text",
        userId: "usr_text",
        slug: "example",
        name: null,
        description: null,
      },
    });
    yield* harness.push({
      ...actor,
      id: "cmd_text_page",
      pushIndex: 2,
      commandName: "createPage",
      payload: { id: "pag_text", siteId: "sit_text", slug: null, title: null, description: null },
    });
    yield* harness.push({
      ...actor,
      id: "cmd_text_add",
      pushIndex: 3,
      commandName: "addTextBrick",
      payload: {
        brickId: "brk_text",
        pageId: "pag_text",
        target: {
          kind: "wall",
          wallId: "wal_pag_text_lg",
          beforeSectionId: null,
        },
      },
    });
    yield* harness.push({
      ...actor,
      id: "cmd_text_font",
      pushIndex: 4,
      commandName: "updateTextPlacement",
      payload: { placementId: "plc_brk_text_lg", state: { fontFamily: "serif", fontSizePx: 24 } },
    });
    yield* harness.flush();
    const db = makeQueryDbVersion({ models: userAggregateV1.models });
    const owner = { release: userAggregateV1, aggregateId: "acct_text" };
    expect(
      yield* harness.query(owner, db.query.brick.findFirst({ where: { id: { eq: "brk_text" } } })),
    ).toMatchObject({ moduleId: "text", state: { content: "" } });
    const placements = yield* harness.query(
      owner,
      db.query.placement.findMany({ where: { brickId: { eq: "brk_text" } } }),
    );
    expect(placements).toHaveLength(4);
    expect(placements.find((entry) => entry.id === "plc_brk_text_lg")?.state).toEqual({
      fontFamily: "serif",
      fontSizePx: 24,
    });
    expect(placements.find((entry) => entry.id === "plc_brk_text_sm")?.state).toEqual({
      fontFamily: "sans",
      fontSizePx: 16,
    });
    const rejected = yield* harness
      .push({
        ...actor,
        id: "cmd_text_stale",
        pushIndex: 5,
        commandName: "addTextBrick",
        payload: {
          brickId: "brk_stale",
          pageId: "pag_text",
          target: {
            kind: "row",
            wallId: "wal_pag_text_lg",
            rowId: "row_missing",
            beforePlacementId: null,
          },
        },
      })
      .pipe(Effect.flip);
    expect(rejected).toMatchObject({ code: "wall-insertion-invalid" });
    expect(
      yield* harness.query(owner, db.query.brick.findFirst({ where: { id: { eq: "brk_stale" } } })),
    ).toBeUndefined();
    const invalidFont = yield* harness
      .push({
        ...actor,
        id: "cmd_text_invalid_font",
        pushIndex: 6,
        commandName: "updateTextPlacement",
        payload: { placementId: "plc_brk_text_lg", state: { fontFamily: "serif", fontSizePx: 0 } },
      })
      .pipe(Effect.flip);
    expect(invalidFont).toMatchObject({ code: "encode-command-payload-failed" });
    const wrongOwner = yield* harness
      .push({
        ...actor,
        id: "cmd_text_wrong_owner",
        pushIndex: 7,
        commandName: "updateTextBrick",
        claims: { aggregateId: "acct_text", clerkUserId: "user_other" },
        payload: { brickId: "brk_text", state: { content: "Unauthorized" } },
      })
      .pipe(Effect.flip);
    expect(wrongOwner).toMatchObject({ code: "update-text-brick-unavailable" });
    yield* harness.flush();
    yield* harness.push({
      ...actor,
      id: "cmd_text_publish",
      pushIndex: 8,
      commandName: "publishSite",
      payload: {
        siteId: "sit_text",
        preferredRowSizing: true,
        preferredStackSizing: true,
        pages: [{ pageId: "pag_text", snapshotId: "psn_text" }],
      },
    });
    yield* harness.push({
      ...actor,
      id: "cmd_text_change",
      pushIndex: 9,
      commandName: "updateTextBrick",
      payload: { brickId: "brk_text", state: { content: "Changed" } },
    });
    yield* harness.flush();
    const snapshot = yield* harness.query(
      owner,
      db.query.pageSnapshot.findFirst({ where: { id: { eq: "psn_text" } } }),
    );
    expect(snapshot?.content.bricks).toContainEqual({
      id: "brk_text",
      moduleId: "text",
      brickState: { content: "" },
      borderWidth: 0,
    });
    const lg = snapshot?.content.walls.find((wall) => wall.breakpoint === "lg");
    const publishedPlacement = lg?.sections
      .flatMap((section) => section.stacks)
      .flatMap((stack) => stack.rows)
      .flatMap((row) => row.placements)
      .find((entry) => entry.brickId === "brk_text");
    expect(publishedPlacement).toMatchObject({
      layoutId: "default",
      placementState: { fontFamily: "serif", fontSizePx: 24 },
      spec: { root: "text" },
    });
    yield* harness.push({
      ...actor,
      id: "cmd_text_move",
      pushIndex: 10,
      commandName: "movePlacementToNewSection",
      payload: {
        placementId: "plc_brk_text_lg",
        newSectionId: "sec_moved",
        newStackId: "stk_moved",
        newRowId: "row_moved",
        beforeSectionId: null,
      },
    });
    const movedWall = yield* harness.query(
      owner,
      db.query.wall.findFirst({ where: { id: { eq: "wal_pag_text_lg" } } }),
    );
    expect(movedWall?.layout.sections).toContainEqual({
      id: "sec_moved",
      stacks: [
        {
          id: "stk_moved",
          name: "Stack",
          rows: [{ id: "row_moved", minHeight: null, placementIds: ["plc_brk_text_lg"] }],
        },
      ],
    });
    yield* harness.push({
      ...actor,
      id: "cmd_text_delete",
      pushIndex: 11,
      commandName: "deleteBrick",
      payload: { brickId: "brk_text" },
    });
    yield* harness.flush();
    expect(
      yield* harness.query(owner, db.query.brick.findFirst({ where: { id: { eq: "brk_text" } } })),
    ).toBeUndefined();
    expect(
      yield* harness.query(
        owner,
        db.query.placement.findMany({ where: { brickId: { eq: "brk_text" } } }),
      ),
    ).toEqual([]);
  }).pipe(Effect.provide(NanoIdFactory)),
);
