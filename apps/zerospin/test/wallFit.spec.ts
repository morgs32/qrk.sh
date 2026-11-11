import { expect, it } from "@effect/vitest";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect, Exit, Schema } from "effect";

import { userAggregateV9 } from "../src/aggregates/user/UserV9";
import { wallLayoutSchemaV2 } from "../src/aggregates/user/layout/wallLayoutSchemaV2";
import { allocateStackWidths, measureWallFit } from "../src/aggregates/user/layout/wallSizing";
import { swatchAndIconPreviewState } from "@qrk.sh/bricks/swatchAndIcon/definition/swatchAndIconPreviewState";
import { makePlacementId } from "../src/aggregates/user/layout/makePlacementId";
import { system } from "../src/system";

it("shares width equally until Stack minimums constrain the allocation", () => {
  expect(allocateStackWidths({ minimumWidths: [160, 160, 160], availableWidth: 900 })).toEqual([
    300, 300, 300,
  ]);
  expect(allocateStackWidths({ minimumWidths: [400, 160, 160], availableWidth: 900 })).toEqual([
    400, 250, 250,
  ]);
  expect(allocateStackWidths({ minimumWidths: [500, 300, 160], availableWidth: 960 })).toEqual([
    500, 300, 160,
  ]);
  const fractional = allocateStackWidths({ minimumWidths: [160, 160, 160], availableWidth: 1000 });
  expect(fractional[0]).toBeCloseTo(1000 / 3);
  expect(fractional.reduce((sum, width) => sum + width, 0)).toBeCloseTo(1000);
});

it("counts the widest Row, empty Stack floor, and existing half-gap allowances", () => {
  const layout = Schema.decodeUnknownSync(wallLayoutSchemaV2)({
    sections: [
      {
        id: "sec_fit",
        stacks: [
          {
            id: "stk_fit",
            name: "Bricks",
            rows: [
              { id: "row_pair", minHeight: null, placementIds: ["plc_a", "plc_b"] },
              { id: "row_single", minHeight: null, placementIds: ["plc_c"] },
            ],
          },
          { id: "stk_empty", name: "Empty", rows: [] },
        ],
      },
    ],
  });
  const placementMinimumWidths = new Map([
    ["plc_a", 160],
    ["plc_b", 160],
    ["plc_c", 320],
  ]);
  for (const brickGap of [0, 12]) {
    const requiredWidth = 480 + 3 * brickGap;
    expect(
      measureWallFit({
        layout,
        placementMinimumWidths,
        wallWidth: requiredWidth - brickGap,
        brickGap,
      }),
    ).toEqual([
      {
        sectionId: "sec_fit",
        stackMinimums: [320 + 2 * brickGap, 160 + brickGap],
        requiredWidth,
        fits: true,
      },
    ]);
    expect(
      measureWallFit({
        layout,
        placementMinimumWidths,
        wallWidth: requiredWidth - brickGap - 1,
        brickGap,
      })[0].fits,
    ).toBe(false);
  }
});

it.effect(
  "inserts adjacent empty Stacks, rejects overflow atomically, and falls back at other widths",
  () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({ system });
      const owner = { release: userAggregateV9, aggregateId: "acct_fit" };
      const db = makeQueryDbVersion({ models: userAggregateV9.models });
      const actor = {
        aggregateName: userAggregateV9.name,
        aggregateVersion: userAggregateV9.version,
        aggregateId: owner.aggregateId,
        actorName: "web",
        actorVersion: 9,
        claims: { aggregateId: owner.aggregateId, clerkUserId: "user_fit" },
        externalOutcome: null,
        nodeId: "node_fit",
        sessionName: "userSession",
      };
      let pushIndex = 1;
      yield* harness.push({
        kind: "system",
        id: "cmd_fit_user",
        commandName: "createUser",
        contractVersion: 1,
        aggregateName: actor.aggregateName,
        aggregateVersion: actor.aggregateVersion,
        aggregateId: owner.aggregateId,
        externalOutcome: null,
        payload: { id: "usr_fit", clerkUserId: "user_fit", username: null, displayName: null },
      });
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: "cmd_fit_site",
        commandName: "createSite",
        contractVersion: 1,
        pushIndex: pushIndex++,
        payload: { id: "sit_fit", userId: "usr_fit", slug: "fit", name: null, description: null },
      });
      for (const [id, slug] of [
        ["pag_fit", null],
        ["pag_fit_full", "full"],
      ]) {
        yield* harness.push({
          ...actor,
          kind: "actor",
          id: `cmd_fit_${id}`,
          commandName: "createPage",
          contractVersion: 2,
          pushIndex: pushIndex++,
          payload: { id, siteId: "sit_fit", slug, title: null, description: null },
        });
      }
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: "cmd_fit_swatch",
        commandName: "addBrick",
        contractVersion: 5,
        pushIndex: pushIndex++,
        payload: {
          id: "brk_fit_swatch",
          pageId: "pag_fit",
          moduleId: "swatch-and-icon",
          state: swatchAndIconPreviewState,
          target: { kind: "wall", wallId: "wal_pag_fit_lg", beforeSectionId: null },
        },
      });
      yield* harness.flush();
      const initialWalls = yield* harness.query(
        owner,
        db.query.wall.findMany({ where: { pageId: { eq: "pag_fit" } } }),
      );
      const large = initialWalls.find((wall) => wall.breakpoint === "lg");
      const small = initialWalls.find((wall) => wall.breakpoint === "sm");
      if (large === undefined || small === undefined) expect.fail("Expected command-created Walls");
      const mainStack = large.layout.sections[0].stacks[0];
      for (const side of ["left", "right"]) {
        yield* harness.push({
          ...actor,
          kind: "actor",
          id: `cmd_fit_insert_${side}`,
          commandName: "insertStack",
          contractVersion: 1,
          pushIndex: pushIndex++,
          payload: { id: `fit_${side}`, wallId: large.id, anchorStackId: mainStack.id, side },
        });
      }
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: "cmd_fit_small_stack",
        commandName: "insertStack",
        contractVersion: 1,
        pushIndex: pushIndex++,
        payload: {
          id: "fit_small",
          wallId: small.id,
          anchorStackId: small.layout.sections[0].stacks[0].id,
          side: "right",
        },
      });
      yield* harness.flush();
      const inserted = yield* harness.query(
        owner,
        db.query.wall.findFirst({ where: { id: { eq: large.id } } }),
      );
      expect(inserted?.layout.sections[0].stacks).toEqual([
        { id: "stk_fit_left", name: "Stack", rows: [] },
        mainStack,
        { id: "stk_fit_right", name: "Stack", rows: [] },
      ]);
      const beforeRefusals = yield* harness.query(owner, db.query.wall.findMany({}));
      for (const [id, wallId, anchorStackId] of [
        ["fit_stale", large.id, "stk_missing"],
        ["fit_full", small.id, small.layout.sections[0].stacks[0].id],
        ["fit_left", large.id, mainStack.id],
      ]) {
        const refusal = yield* harness
          .push({
            ...actor,
            kind: "actor",
            id: `cmd_${id}_refusal`,
            commandName: "insertStack",
            contractVersion: 1,
            pushIndex: pushIndex++,
            payload: { id, wallId, anchorStackId, side: "left" },
          })
          .pipe(Effect.flip);
        expect(refusal.status).toBe(409);
      }
      const foreign = yield* harness
        .push({
          ...actor,
          kind: "actor",
          id: "cmd_fit_foreign",
          commandName: "insertStack",
          contractVersion: 1,
          pushIndex: pushIndex++,
          claims: { aggregateId: owner.aggregateId, clerkUserId: "user_other" },
          payload: {
            id: "fit_foreign",
            wallId: large.id,
            anchorStackId: mainStack.id,
            side: "left",
          },
        })
        .pipe(Effect.exit);
      expect(Exit.isFailure(foreign)).toBe(true);
      yield* harness.flush();
      expect(yield* harness.query(owner, db.query.wall.findMany({}))).toEqual(beforeRefusals);

      yield* harness.push({
        ...actor,
        kind: "actor",
        id: "cmd_fit_link",
        commandName: "addBrick",
        contractVersion: 5,
        pushIndex: pushIndex++,
        payload: {
          id: "brk_fit_link",
          pageId: "pag_fit",
          moduleId: "link",
          state: null,
          target: { kind: "stack", wallId: large.id, stackId: mainStack.id, beforeRowId: null },
        },
      });
      yield* harness.flush();
      const smallAfter = yield* harness.query(
        owner,
        db.query.wall.findFirst({ where: { id: { eq: small.id } } }),
      );
      if (smallAfter === undefined) expect.fail("Expected the surviving small Wall");
      expect(smallAfter.layout.sections).toHaveLength(2);
      expect(smallAfter.layout.sections[0].stacks).toEqual([
        small.layout.sections[0].stacks[0],
        { id: "stk_fit_small", name: "Stack", rows: [] },
      ]);
      expect(smallAfter.layout.sections[1].stacks[0].rows[0].placementIds).toEqual([
        makePlacementId("brk_fit_link", "sm"),
      ]);
      const beforeOverflow = yield* harness.query(owner, db.query.wall.findMany({}));
      const bricksBefore = yield* harness.query(owner, db.query.brick.findMany({}));
      const placementsBefore = yield* harness.query(owner, db.query.placement.findMany({}));
      const overflow = yield* harness
        .push({
          ...actor,
          kind: "actor",
          id: "cmd_fit_overflow_add",
          commandName: "addBrick",
          contractVersion: 5,
          pushIndex: pushIndex++,
          payload: {
            id: "brk_fit_overflow",
            pageId: "pag_fit",
            moduleId: "swatch-and-icon",
            state: swatchAndIconPreviewState,
            target: {
              kind: "row",
              wallId: small.id,
              rowId: small.layout.sections[0].stacks[0].rows[0].id,
              beforePlacementId: null,
            },
          },
        })
        .pipe(Effect.flip);
      expect(overflow).toMatchObject({ status: 409, message: "Not enough space in this Section" });
      const movedOverflow = yield* harness
        .push({
          ...actor,
          kind: "actor",
          id: "cmd_fit_overflow_move",
          commandName: "movePlacementToRow",
          contractVersion: 4,
          pushIndex: pushIndex++,
          payload: {
            placementId: makePlacementId("brk_fit_link", "sm"),
            rowId: small.layout.sections[0].stacks[0].rows[0].id,
            beforePlacementId: null,
          },
        })
        .pipe(Effect.flip);
      expect(movedOverflow).toMatchObject({
        status: 409,
        message: "Not enough space in this Section",
      });
      yield* harness.flush();
      expect(yield* harness.query(owner, db.query.wall.findMany({}))).toEqual(beforeOverflow);
      expect(yield* harness.query(owner, db.query.brick.findMany({}))).toEqual(bricksBefore);
      expect(yield* harness.query(owner, db.query.placement.findMany({}))).toEqual(
        placementsBefore,
      );

      yield* harness.push({
        ...actor,
        kind: "actor",
        id: "cmd_fit_move_row",
        commandName: "movePlacementToNewRow",
        contractVersion: 3,
        pushIndex: pushIndex++,
        payload: {
          placementId: makePlacementId("brk_fit_swatch", "lg"),
          stackId: mainStack.id,
          newRowId: "row_fit_moved",
          beforeRowId: null,
        },
      });
      yield* harness.flush();
      const afterMove = yield* harness.query(
        owner,
        db.query.wall.findFirst({ where: { id: { eq: large.id } } }),
      );
      expect(afterMove?.layout.sections[0].stacks.map((stack) => stack.id)).toEqual([
        "stk_fit_left",
        mainStack.id,
        "stk_fit_right",
      ]);
      expect(afterMove?.layout.sections[0].stacks[1].rows.at(-1)).toEqual({
        id: "row_fit_moved",
        minHeight: null,
        placementIds: [makePlacementId("brk_fit_swatch", "lg")],
      });

      // A different Page fills xl exactly; a Site-wide gap change must check it too.
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: "cmd_fit_full_section",
        commandName: "addWallSection",
        contractVersion: 2,
        pushIndex: pushIndex++,
        payload: { id: "fit_full", wallId: "wal_pag_fit_full_xl", beforeSectionId: null },
      });
      for (let index = 0; index < 8; index++) {
        yield* harness.push({
          ...actor,
          kind: "actor",
          id: `cmd_fit_full_${index}`,
          commandName: "insertStack",
          contractVersion: 1,
          pushIndex: pushIndex++,
          payload: {
            id: `fit_full_${index}`,
            wallId: "wal_pag_fit_full_xl",
            anchorStackId: "stk_fit_full",
            side: "right",
          },
        });
      }
      yield* harness.flush();
      const full = yield* harness.query(
        owner,
        db.query.wall.findFirst({ where: { id: { eq: "wal_pag_fit_full_xl" } } }),
      );
      expect(full?.layout.sections[0].stacks).toHaveLength(9);
      const gap = yield* harness
        .push({
          ...actor,
          kind: "actor",
          id: "cmd_fit_gap_refused",
          commandName: "updateSiteSettings",
          contractVersion: 2,
          pushIndex: pushIndex++,
          payload: {
            id: "sit_fit",
            name: null,
            description: null,
            logoUrl: null,
            faviconLightUrl: null,
            faviconDarkUrl: null,
            cardStyle: false,
            stickyNavbar: true,
            brickGap: 1,
          },
        })
        .pipe(Effect.flip);
      expect(gap).toMatchObject({ status: 409 });
      yield* harness.flush();
      expect(
        yield* harness.query(owner, db.query.site.findFirst({ where: { id: { eq: "sit_fit" } } })),
      ).toMatchObject({ brickGap: 0 });
      expect(
        yield* harness.query(
          owner,
          db.query.wall.findFirst({ where: { id: { eq: "wal_pag_fit_full_xl" } } }),
        ),
      ).toEqual(full);
    }).pipe(Effect.provide(NanoIdFactory)),
);
