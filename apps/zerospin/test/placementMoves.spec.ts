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
import { swatchAndIconPreviewState } from "@qrk.sh/bricks/modules/swatchAndIcon/definition/swatchAndIconPreviewState";
import { makePlacementId } from "@qrk.sh/bricks/zerospin/wall/makePlacementId";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import * as Effect from "effect/Effect";
import { userAggregateV1 } from "../src/fresh/userAggregateV1";
import { system } from "../src/system";

it.effect(
  "moves Placements, persists Row sizing, and rejects stale or unauthorized moves atomically",
  () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({ system });
      yield* harness.push({
        kind: "system",
        id: "cmd_moves_user",
        commandName: "createUser",
        contractVersion: 1,
        aggregateName: "user",
        aggregateVersion: 1,
        aggregateId: "acct_moves",
        externalOutcome: null,
        payload: { id: "usr_moves", clerkUserId: "user_moves", displayName: null },
      });
      const actor = {
        kind: "actor" as const,
        aggregateName: "user",
        aggregateVersion: 1,
        aggregateId: "acct_moves",
        actorName: "web",
        actorVersion: 1,
        contractVersion: 1,
        nodeId: "node_moves",
        sessionName: "userSession",
        claims: { aggregateId: "acct_moves", clerkUserId: "user_moves" },
        externalOutcome: null,
      };
      yield* harness.push({
        ...actor,
        id: "cmd_moves_site",
        pushIndex: 1,
        commandName: "createSite",
        payload: {
          id: "sit_moves",
          userId: "usr_moves",
          slug: "moves",
          name: null,
          description: null,
        },
      });
      yield* harness.push({
        ...actor,
        id: "cmd_moves_page",
        pushIndex: 2,
        commandName: "createPage",
        payload: {
          id: "pag_moves",
          siteId: "sit_moves",
          slug: null,
          title: null,
          description: null,
        },
      });
      yield* harness.push({
        ...actor,
        id: "cmd_moves_a",
        pushIndex: 3,
        commandName: "addSwatchAndIconBrick",
        payload: {
          brickId: "brk_moves_a",
          pageId: "pag_moves",
          state: swatchAndIconPreviewState,
          target: { kind: "wall", wallId: "wal_pag_moves_lg", beforeSectionId: null },
        },
      });
      yield* harness.flush();
      const db = makeQueryDbVersion({ models: userAggregateV1.models });
      const owner = { release: userAggregateV1, aggregateId: "acct_moves" };
      const initial = yield* harness.query(
        owner,
        db.query.wall.findFirst({ where: { id: { eq: "wal_pag_moves_lg" } } }),
      );
      const section = initial?.layout.sections[0];
      const stack = section?.stacks[0];
      const row = stack?.rows[0];
      if (section === undefined || stack === undefined || row === undefined)
        return expect.fail("Expected the initial Row");
      let pushIndex = 4;
      for (const letter of ["b", "c"]) {
        yield* harness.push({
          ...actor,
          id: `cmd_moves_${letter}`,
          pushIndex: pushIndex++,
          commandName: "addSwatchAndIconBrick",
          payload: {
            brickId: `brk_moves_${letter}`,
            pageId: "pag_moves",
            state: swatchAndIconPreviewState,
            target: {
              kind: "row",
              wallId: "wal_pag_moves_lg",
              rowId: row.id,
              beforePlacementId: null,
            },
          },
        });
      }
      yield* harness.flush();
      const a = makePlacementId("brk_moves_a", "lg");
      const b = makePlacementId("brk_moves_b", "lg");
      const c = makePlacementId("brk_moves_c", "lg");
      yield* harness.push({
        ...actor,
        id: "cmd_moves_reorder",
        pushIndex: pushIndex++,
        commandName: "movePlacementToRow",
        payload: { placementId: c, rowId: row.id, beforePlacementId: a },
      });
      yield* harness.push({
        ...actor,
        id: "cmd_moves_weights",
        pushIndex: pushIndex++,
        commandName: "setRowWidthWeights",
        payload: {
          wallId: "wal_pag_moves_lg",
          rowId: row.id,
          placements: [
            { placementId: c, widthWeight: 200 },
            { placementId: a, widthWeight: 240 },
            { placementId: b, widthWeight: 280 },
          ],
        },
      });
      yield* harness.push({
        ...actor,
        id: "cmd_moves_width",
        pushIndex: pushIndex++,
        commandName: "setRowPreferredWidth",
        payload: { wallId: "wal_pag_moves_lg", rowId: row.id, preferredWidth: 720 },
      });
      yield* harness.push({
        ...actor,
        id: "cmd_moves_align",
        pushIndex: pushIndex++,
        commandName: "setRowAlignment",
        payload: { wallId: "wal_pag_moves_lg", rowId: row.id, alignment: "center" },
      });
      yield* harness.flush();
      const sized = yield* harness.query(
        owner,
        db.query.wall.findFirst({ where: { id: { eq: "wal_pag_moves_lg" } } }),
      );
      expect(sized?.layout.sections[0]?.stacks[0]?.rows[0]).toMatchObject({
        placementIds: [c, a, b],
        preferredWidth: 720,
        alignment: "center",
      });
      const placements = yield* harness.query(
        owner,
        db.query.placement.findMany({ where: { wallId: { eq: "wal_pag_moves_lg" } } }),
      );
      expect(placements.find((p) => p.id === a)?.widthWeight).toBe(240);
      expect(placements.find((p) => p.id === b)?.widthWeight).toBe(280);
      expect(placements.find((p) => p.id === c)?.widthWeight).toBe(200);
      yield* harness.flush();
      yield* harness.push({
        ...actor,
        id: "cmd_moves_publish",
        pushIndex: pushIndex++,
        commandName: "publishSite",
        payload: {
          siteId: "sit_moves",
          preferredRowSizing: true,
          preferredStackSizing: true,
          pages: [{ pageId: "pag_moves", snapshotId: "psn_moves" }],
        },
      });
      yield* harness.flush();
      const snapshot = yield* harness.query(
        owner,
        db.query.pageSnapshot.findFirst({ where: { id: { eq: "psn_moves" } } }),
      );
      const savedRow = snapshot?.content.walls.find((wall) => wall.breakpoint === "lg")?.sections[0]
        ?.stacks[0]?.rows[0];
      expect(savedRow).toMatchObject({ preferredWidth: 720, alignment: "center" });
      expect(savedRow?.placements.map((placement) => placement.widthWeight)).toEqual([
        200, 240, 280,
      ]);
      const invalidSizing = yield* harness
        .push({
          ...actor,
          id: "cmd_moves_invalid_weights",
          pushIndex: pushIndex++,
          commandName: "setRowWidthWeights",
          payload: {
            wallId: "wal_pag_moves_lg",
            rowId: row.id,
            placements: [{ placementId: a, widthWeight: 300 }],
          },
        })
        .pipe(Effect.flip);
      expect(invalidSizing).toMatchObject({ code: "row-width-weights-invalid" });
      const stale = yield* harness
        .push({
          ...actor,
          id: "cmd_moves_stale",
          pushIndex: pushIndex++,
          commandName: "movePlacementToRow",
          payload: { placementId: a, rowId: "row_missing", beforePlacementId: null },
        })
        .pipe(Effect.flip);
      expect(stale).toMatchObject({ code: "move-placement-invalid-layout" });
      const unauthorized = yield* harness
        .push({
          ...actor,
          id: "cmd_moves_unauthorized",
          pushIndex: pushIndex++,
          commandName: "movePlacementToRow",
          claims: { aggregateId: "acct_moves", clerkUserId: "user_other" },
          payload: { placementId: a, rowId: row.id, beforePlacementId: b },
        })
        .pipe(Effect.flip);
      expect(unauthorized).toMatchObject({ code: "move-placement-invalid-layout" });
      expect(
        yield* harness.query(
          owner,
          db.query.wall.findFirst({ where: { id: { eq: "wal_pag_moves_lg" } } }),
        ),
      ).toEqual(sized);
      yield* harness.push({
        ...actor,
        id: "cmd_moves_new_row",
        pushIndex: pushIndex++,
        commandName: "movePlacementToNewRow",
        payload: { placementId: b, stackId: stack.id, newRowId: "row_moved", beforeRowId: null },
      });
      yield* harness.push({
        ...actor,
        id: "cmd_moves_new_stack",
        pushIndex: pushIndex++,
        commandName: "movePlacementToNewStack",
        payload: {
          placementId: c,
          sectionId: section.id,
          newStackId: "stk_moved",
          newRowId: "row_stack",
        },
      });
      yield* harness.push({
        ...actor,
        id: "cmd_moves_new_section",
        pushIndex: pushIndex++,
        commandName: "movePlacementToNewSection",
        payload: {
          placementId: a,
          newSectionId: "sec_moved",
          newStackId: "stk_section",
          newRowId: "row_section",
          beforeSectionId: null,
        },
      });
      yield* harness.flush();
      const moved = yield* harness.query(
        owner,
        db.query.wall.findFirst({ where: { id: { eq: "wal_pag_moves_lg" } } }),
      );
      const rows = moved?.layout.sections.flatMap((s) => s.stacks).flatMap((s) => s.rows) ?? [];
      expect(rows.find((r) => r.id === "row_moved")?.placementIds).toEqual([b]);
      expect(rows.find((r) => r.id === "row_stack")?.placementIds).toEqual([c]);
      expect(rows.find((r) => r.id === "row_section")?.placementIds).toEqual([a]);
      const otherWalls = yield* harness.query(
        owner,
        db.query.placement.findMany({ where: { brickId: { eq: "brk_moves_a" } } }),
      );
      expect(otherWalls).toHaveLength(4);
    }).pipe(Effect.provide(NanoIdFactory)),
);
