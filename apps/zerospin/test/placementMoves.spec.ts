import { expect, it } from "@effect/vitest";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect } from "effect";
import { encodePayload } from "@zerospin/core/contracts/encodePayload";
import { decodeAndAdaptPayload } from "@zerospin/core/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload";
import * as TestClock from "effect/testing/TestClock";

import { userAggregateV5 } from "../src/aggregates/user/UserV5";
import { userAggregateV6 } from "../src/aggregates/user/UserV6";
import { movePlacementToRowV1 } from "../src/aggregates/user/contracts/wall/MovePlacementToRowContractV1";
import { movePlacementToRowV2 } from "../src/aggregates/user/contracts/wall/MovePlacementToRowContractV2";
import { swatchAndIconV1 } from "../src/modules/swatchAndIcon/swatchAndIconV1";
import { makePlacementId } from "../src/modules/lib/makePlacementId";
import { system } from "../src/system";

it.effect("moves Placements with explicit structural intentions and atomic refusals", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    const owner = { release: userAggregateV5, aggregateId: "acct_moves" };
    const db = makeQueryDbVersion({ models: userAggregateV5.models });
    const actor = {
      aggregateName: userAggregateV5.name,
      aggregateVersion: userAggregateV5.version,
      aggregateId: "acct_moves",
      actorName: "web",
      actorVersion: 5,
      claims: { aggregateId: "acct_moves", clerkUserId: "user_moves" },
      externalOutcome: null,
      nodeId: "node_moves",
      sessionName: "userSession",
    };
    let pushIndex = 1;
    yield* harness.push({
      kind: "system",
      id: "cmd_moves_user",
      commandName: "createUser",
      contractVersion: 1,
      aggregateName: userAggregateV5.name,
      aggregateVersion: userAggregateV5.version,
      aggregateId: "acct_moves",
      externalOutcome: null,
      payload: {
        id: "usr_moves",
        clerkUserId: "user_moves",
        username: null,
        displayName: null,
      },
    });
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_moves_site",
      commandName: "createSite",
      contractVersion: 1,
      pushIndex: pushIndex++,
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
      kind: "actor",
      id: "cmd_moves_page",
      commandName: "createPage",
      contractVersion: 1,
      pushIndex: pushIndex++,
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
      kind: "actor",
      id: "cmd_moves_brick_a",
      commandName: "addBrick",
      contractVersion: 3,
      pushIndex: pushIndex++,
      payload: {
        id: "brk_moves_a",
        pageId: "pag_moves",
        moduleId: "swatch-and-icon",
        state: swatchAndIconV1.defaultState,
        target: { kind: "wall", wallId: "wal_pag_moves_lg", beforeSectionId: null },
      },
    });
    yield* harness.flush();
    const initialWall = yield* harness.query(
      owner,
      db.query.wall.findFirst({ where: { id: { eq: "wal_pag_moves_lg" } } }),
    );
    if (initialWall === undefined) expect.fail("Expected the command-created Wall");
    const section = initialWall.layout.sections[0];
    const stack = section.stacks[0];
    const row = stack.rows[0];
    for (const letter of ["b", "c"]) {
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: `cmd_moves_brick_${letter}`,
        commandName: "addBrick",
        contractVersion: 3,
        pushIndex: pushIndex++,
        payload: {
          id: `brk_moves_${letter}`,
          pageId: "pag_moves",
          moduleId: "swatch-and-icon",
          state: swatchAndIconV1.defaultState,
          target: {
            kind: "row",
            wallId: initialWall.id,
            rowId: row.id,
            beforePlacementId: null,
          },
        },
      });
    }
    yield* harness.flush();
    const wallsBefore = yield* harness.query(owner, db.query.wall.findMany({}));
    const placementsBefore = yield* harness.query(owner, db.query.placement.findMany({}));
    const bricksBefore = yield* harness.query(owner, db.query.brick.findMany({}));
    const a = makePlacementId("brk_moves_a", "lg");
    const b = makePlacementId("brk_moves_b", "lg");
    const c = makePlacementId("brk_moves_c", "lg");

    // Same-row moves work in both directions and append without allocating nodes.
    for (const [index, move] of [
      { placementId: c, beforePlacementId: a, expected: [c, a, b] },
      { placementId: b, beforePlacementId: c, expected: [b, c, a] },
      { placementId: b, beforePlacementId: null, expected: [c, a, b] },
    ].entries()) {
      const retainedPayload = {
        placementId: move.placementId,
        rowId: row.id,
        beforePlacementId: move.beforePlacementId,
      };
      const encoded = yield* encodePayload(movePlacementToRowV1, {
        version: 1,
        payload: retainedPayload,
      });
      expect(
        yield* decodeAndAdaptPayload(movePlacementToRowV2, {
          command: { commandName: "movePlacementToRow", contractVersion: 1, payload: encoded },
        }),
      ).toEqual(retainedPayload);
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: `cmd_moves_reorder_${index}`,
        commandName: "movePlacementToRow",
        contractVersion: 1,
        pushIndex: pushIndex++,
        payload: {
          placementId: move.placementId,
          rowId: row.id,
          beforePlacementId: move.beforePlacementId,
        },
      });
      yield* harness.flush();
      const moved = yield* harness.query(
        owner,
        db.query.wall.findFirst({ where: { id: { eq: initialWall.id } } }),
      );
      if (moved === undefined) expect.fail("Expected the command-created Wall");
      expect(moved.layout.sections[0].stacks[0].rows[0].placementIds).toEqual(move.expected);
    }
    const reordered = yield* harness.query(
      owner,
      db.query.wall.findFirst({ where: { id: { eq: initialWall.id } } }),
    );
    if (reordered === undefined) expect.fail("Expected the command-created Wall");
    for (const [index, noOp] of [
      { placementId: c, beforePlacementId: c },
      { placementId: c, beforePlacementId: a },
      { placementId: b, beforePlacementId: null },
    ].entries()) {
      yield* TestClock.adjust("1 second");
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: `cmd_moves_noop_${index}`,
        commandName: "movePlacementToRow",
        contractVersion: 1,
        pushIndex: pushIndex++,
        payload: { ...noOp, rowId: row.id },
      });
      yield* harness.flush();
      expect(
        yield* harness.query(
          owner,
          db.query.wall.findFirst({ where: { id: { eq: initialWall.id } } }),
        ),
      ).toEqual(reordered);
    }

    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_moves_new_row",
      commandName: "movePlacementToNewRow",
      contractVersion: 1,
      pushIndex: pushIndex++,
      payload: {
        placementId: a,
        stackId: stack.id,
        newRowId: "row_moves_new",
        beforeRowId: row.id,
      },
    });
    yield* harness.flush();
    const withNewRow = yield* harness.query(
      owner,
      db.query.wall.findFirst({ where: { id: { eq: initialWall.id } } }),
    );
    if (withNewRow === undefined) expect.fail("Expected the command-created Wall");
    expect(withNewRow.layout.sections[0].stacks[0].rows).toEqual([
      { id: "row_moves_new", placementIds: [a] },
      { id: row.id, placementIds: [c, b] },
    ]);
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_moves_new_stack",
      commandName: "movePlacementToNewStack",
      contractVersion: 1,
      pushIndex: pushIndex++,
      payload: {
        placementId: a,
        sectionId: section.id,
        newStackId: "stk_moves_new",
        newRowId: "row_moves_stack",
      },
    });
    yield* harness.flush();
    const split = yield* harness.query(
      owner,
      db.query.wall.findFirst({ where: { id: { eq: initialWall.id } } }),
    );
    if (split === undefined) expect.fail("Expected the command-created Wall");
    expect(split.layout.sections[0].stacks).toEqual([
      { ...stack, rows: [{ id: row.id, placementIds: [c, b] }] },
      {
        id: "stk_moves_new",
        name: "Stack",
        rows: [{ id: "row_moves_stack", placementIds: [a] }],
      },
    ]);
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_moves_new_section",
      commandName: "movePlacementToNewSection",
      contractVersion: 1,
      pushIndex: pushIndex++,
      payload: {
        placementId: a,
        newSectionId: "sec_moves_new",
        newStackId: "stk_moves_section",
        newRowId: "row_moves_section",
        beforeSectionId: section.id,
      },
    });
    yield* harness.flush();
    const separated = yield* harness.query(
      owner,
      db.query.wall.findFirst({ where: { id: { eq: initialWall.id } } }),
    );
    if (separated === undefined) expect.fail("Expected the command-created Wall");
    expect(separated.layout.sections).toEqual([
      {
        id: "sec_moves_new",
        stacks: [
          {
            id: "stk_moves_section",
            name: "Stack",
            rows: [{ id: "row_moves_section", placementIds: [a] }],
          },
        ],
      },
      { ...section, stacks: [{ ...stack, rows: [{ id: row.id, placementIds: [c, b] }] }] },
    ]);

    // Every branch refuses stale or colliding destinations without partial creation.
    const beforeRefusals = yield* harness.query(owner, db.query.wall.findMany({}));
    for (const [index, rejectedMove] of [
      {
        commandName: "movePlacementToRow",
        payload: { placementId: a, rowId: row.id, beforePlacementId: "plc_missing" },
      },
      {
        commandName: "movePlacementToNewRow",
        payload: {
          placementId: a,
          stackId: stack.id,
          newRowId: "row_moves_stale",
          beforeRowId: "row_missing",
        },
      },
      {
        commandName: "movePlacementToNewStack",
        payload: {
          placementId: a,
          sectionId: section.id,
          newStackId: stack.id,
          newRowId: "row_moves_collision",
        },
      },
      {
        commandName: "movePlacementToNewSection",
        payload: {
          placementId: a,
          newSectionId: "sec_moves_new",
          newStackId: "stk_moves_collision",
          newRowId: "row_moves_collision",
          beforeSectionId: null,
        },
      },
    ].entries()) {
      const rejected = yield* harness
        .push({
          ...actor,
          kind: "actor",
          id: `cmd_moves_rejected_${index}`,
          commandName: rejectedMove.commandName,
          contractVersion: 1,
          pushIndex: pushIndex++,
          payload: rejectedMove.payload,
        })
        .pipe(Effect.flip);
      expect(rejected.status).toBe(409);
    }
    yield* harness.flush();
    expect(yield* harness.query(owner, db.query.wall.findMany({}))).toEqual(beforeRefusals);
    expect(yield* harness.query(owner, db.query.placement.findMany({}))).toEqual(placementsBefore);
    expect(yield* harness.query(owner, db.query.brick.findMany({}))).toEqual(bricksBefore);
    for (const otherWall of wallsBefore.filter((entry) => entry.id !== initialWall.id))
      expect(beforeRefusals.find((entry) => entry.id === otherWall.id)).toEqual(otherWall);

    // On sm a second nonempty Stack is refused; replacing an emptied Stack fits.
    const small = wallsBefore.find((entry) => entry.breakpoint === "sm");
    if (small === undefined) expect.fail("Expected the small Wall");
    const smallSection = small.layout.sections[0];
    const smallStack = smallSection.stacks[0];
    const smallA = makePlacementId("brk_moves_a", "sm");
    const capacityRefusal = yield* harness
      .push({
        ...actor,
        kind: "actor",
        id: "cmd_moves_capacity_refused",
        commandName: "movePlacementToNewStack",
        contractVersion: 1,
        pushIndex: pushIndex++,
        payload: {
          placementId: smallA,
          sectionId: smallSection.id,
          newStackId: "stk_moves_capacity",
          newRowId: "row_moves_capacity",
        },
      })
      .pipe(Effect.flip);
    expect(capacityRefusal.status).toBe(409);
    yield* harness.flush();
    expect(
      yield* harness.query(owner, db.query.wall.findFirst({ where: { id: { eq: small.id } } })),
    ).toEqual(small);
    for (const letter of ["b", "c"]) {
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: `cmd_moves_small_section_${letter}`,
        commandName: "movePlacementToNewSection",
        contractVersion: 1,
        pushIndex: pushIndex++,
        payload: {
          placementId: makePlacementId(`brk_moves_${letter}`, "sm"),
          newSectionId: `sec_moves_small_${letter}`,
          newStackId: `stk_moves_small_${letter}`,
          newRowId: `row_moves_small_${letter}`,
          beforeSectionId: null,
        },
      });
    }
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_moves_capacity_after_cleanup",
      commandName: "movePlacementToNewStack",
      contractVersion: 1,
      pushIndex: pushIndex++,
      payload: {
        placementId: smallA,
        sectionId: smallSection.id,
        newStackId: "stk_moves_capacity",
        newRowId: "row_moves_capacity",
      },
    });
    yield* harness.flush();
    const smallAfter = yield* harness.query(
      owner,
      db.query.wall.findFirst({ where: { id: { eq: small.id } } }),
    );
    if (smallAfter === undefined) expect.fail("Expected the command-created Wall");
    expect(smallAfter.layout.sections[0].stacks).toEqual([
      {
        id: "stk_moves_capacity",
        name: "Stack",
        rows: [{ id: "row_moves_capacity", placementIds: [smallA] }],
      },
    ]);
    expect(
      smallAfter.layout.sections.flatMap((entry) => entry.stacks).map((entry) => entry.id),
    ).not.toContain(smallStack.id);
    const finalWalls = yield* harness.query(owner, db.query.wall.findMany({}));
    for (const unchanged of beforeRefusals.filter((entry) => entry.id !== small.id))
      expect(finalWalls.find((entry) => entry.id === unchanged.id)).toEqual(unchanged);
    expect(yield* harness.query(owner, db.query.placement.findMany({}))).toEqual(placementsBefore);
    expect(yield* harness.query(owner, db.query.brick.findMany({}))).toEqual(bricksBefore);
  }).pipe(Effect.provide(NanoIdFactory)),
);

it.effect("joins compatible Rows and refuses variable-height sharing atomically", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    const owner = { release: userAggregateV6, aggregateId: "acct_row_sharing" };
    const db = makeQueryDbVersion({ models: userAggregateV6.models });
    const actor = {
      aggregateName: userAggregateV6.name,
      aggregateVersion: userAggregateV6.version,
      aggregateId: owner.aggregateId,
      actorName: "web",
      actorVersion: 6,
      claims: { aggregateId: owner.aggregateId, clerkUserId: "user_row_sharing" },
      externalOutcome: null,
      nodeId: "node_row_sharing",
      sessionName: "userSession",
    };
    let pushIndex = 1;
    yield* harness.push({
      kind: "system",
      id: "cmd_sharing_user",
      commandName: "createUser",
      contractVersion: 1,
      aggregateName: userAggregateV6.name,
      aggregateVersion: userAggregateV6.version,
      aggregateId: owner.aggregateId,
      externalOutcome: null,
      payload: {
        id: "usr_row_sharing",
        clerkUserId: actor.claims.clerkUserId,
        username: null,
        displayName: null,
      },
    });
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_sharing_site",
      commandName: "createSite",
      contractVersion: 1,
      pushIndex: pushIndex++,
      payload: {
        id: "sit_row_sharing",
        userId: "usr_row_sharing",
        slug: "row-sharing",
        name: null,
        description: null,
      },
    });
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_sharing_page",
      commandName: "createPage",
      contractVersion: 1,
      pushIndex: pushIndex++,
      payload: {
        id: "pag_row_sharing",
        siteId: "sit_row_sharing",
        slug: null,
        title: null,
        description: null,
      },
    });
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_sharing_brick_a",
      commandName: "addBrick",
      contractVersion: 3,
      pushIndex: pushIndex++,
      payload: {
        id: "brk_sharing_a",
        pageId: "pag_row_sharing",
        moduleId: "swatch-and-icon",
        state: swatchAndIconV1.defaultState,
        target: { kind: "wall", wallId: "wal_pag_row_sharing_lg", beforeSectionId: null },
      },
    });
    yield* harness.flush();
    const initial = yield* harness.query(
      owner,
      db.query.wall.findFirst({ where: { id: { eq: "wal_pag_row_sharing_lg" } } }),
    );
    if (initial === undefined) expect.fail("Expected the command-created Wall");
    const stack = initial.layout.sections[0].stacks[0];
    const fixedRow = stack.rows[0];
    for (const entry of [
      { id: "brk_sharing_b", moduleId: "swatch-and-icon", state: swatchAndIconV1.defaultState },
      { id: "brk_sharing_article", moduleId: "article", state: null },
    ]) {
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: `cmd_sharing_${entry.id}`,
        commandName: "addBrick",
        contractVersion: 3,
        pushIndex: pushIndex++,
        payload: {
          ...entry,
          pageId: "pag_row_sharing",
          target: { kind: "stack", wallId: initial.id, stackId: stack.id, beforeRowId: null },
        },
      });
    }
    yield* harness.flush();
    const before = yield* harness.query(owner, db.query.wall.findMany({}));
    const placements = yield* harness.query(owner, db.query.placement.findMany({}));
    const bricks = yield* harness.query(owner, db.query.brick.findMany({}));
    const a = makePlacementId("brk_sharing_a", "lg");
    const b = makePlacementId("brk_sharing_b", "lg");
    const article = makePlacementId("brk_sharing_article", "lg");
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_sharing_compatible_join",
      commandName: "movePlacementToRow",
      contractVersion: 2,
      pushIndex: pushIndex++,
      payload: { placementId: b, rowId: fixedRow.id, beforePlacementId: a },
    });
    yield* harness.flush();
    const joined = yield* harness.query(
      owner,
      db.query.wall.findFirst({ where: { id: { eq: initial.id } } }),
    );
    if (joined === undefined) expect.fail("Expected the command-created Wall");
    expect(joined.layout.sections[0].stacks[0].rows[0]).toEqual({
      id: fixedRow.id,
      placementIds: [b, a],
    });
    const articleRow = joined.layout.sections[0].stacks[0].rows[1];
    expect(articleRow.placementIds).toEqual([article]);

    // Both directions of illegal sharing refuse without changing any model row.
    for (const [index, move] of [
      { placementId: a, rowId: articleRow.id },
      { placementId: article, rowId: fixedRow.id },
    ].entries()) {
      const refusal = yield* harness
        .push({
          ...actor,
          kind: "actor",
          id: `cmd_sharing_refused_${index}`,
          commandName: "movePlacementToRow",
          contractVersion: 2,
          pushIndex: pushIndex++,
          payload: { ...move, beforePlacementId: null },
        })
        .pipe(Effect.flip);
      expect(refusal.status).toBe(409);
      yield* harness.flush();
      expect(
        yield* harness.query(owner, db.query.wall.findFirst({ where: { id: { eq: initial.id } } })),
      ).toEqual(joined);
    }
    expect(yield* harness.query(owner, db.query.placement.findMany({}))).toEqual(placements);
    expect(yield* harness.query(owner, db.query.brick.findMany({}))).toEqual(bricks);
    const afterJoin = yield* harness.query(owner, db.query.wall.findMany({}));
    for (const otherWall of before.filter((entry) => entry.id !== initial.id))
      expect(afterJoin.find((entry) => entry.id === otherWall.id)).toEqual(otherWall);

    // An authored empty Stack receives its first Row without adding another container.
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_sharing_empty_section",
      commandName: "addWallSection",
      contractVersion: 1,
      pushIndex: pushIndex++,
      payload: { id: "sharing_empty", wallId: initial.id, beforeSectionId: null },
    });
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_sharing_first_row",
      commandName: "movePlacementToNewRow",
      contractVersion: 1,
      pushIndex: pushIndex++,
      payload: {
        placementId: article,
        stackId: "stk_sharing_empty",
        newRowId: "row_sharing_empty",
        beforeRowId: null,
      },
    });
    yield* harness.flush();
    const withFirstRow = yield* harness.query(
      owner,
      db.query.wall.findFirst({ where: { id: { eq: initial.id } } }),
    );
    if (withFirstRow === undefined) expect.fail("Expected the command-created Wall");
    expect(withFirstRow.layout.sections.at(-1)?.stacks).toEqual([
      {
        id: "stk_sharing_empty",
        name: "Stack",
        rows: [{ id: "row_sharing_empty", placementIds: [article] }],
      },
    ]);
    expect(yield* harness.query(owner, db.query.placement.findMany({}))).toEqual(placements);
    expect(yield* harness.query(owner, db.query.brick.findMany({}))).toEqual(bricks);
  }).pipe(Effect.provide(NanoIdFactory)),
);
