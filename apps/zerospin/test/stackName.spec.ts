import { expect, it } from "@effect/vitest";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect } from "effect";

import { userAggregateV4 } from "../src/aggregates/user/UserV4";
import { swatchAndIconV1 } from "../src/modules/swatchAndIcon/swatchAndIconV1";
import { system } from "../src/system";

it.effect("renames only the owning Wall's Stack and rejects blank or mismatched targets", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    const owner = { release: userAggregateV4, aggregateId: "acct_stack" };
    const db = makeQueryDbVersion({ models: userAggregateV4.models });
    const actor = {
      aggregateName: userAggregateV4.name,
      aggregateVersion: userAggregateV4.version,
      aggregateId: "acct_stack",
      actorName: "web",
      actorVersion: 4,
      claims: { aggregateId: "acct_stack", clerkUserId: "user_stack" },
      externalOutcome: null,
      nodeId: "node_stack",
      sessionName: "userSession",
    };
    yield* harness.push({
      kind: "system",
      id: "cmd_stack_user",
      commandName: "createUser",
      contractVersion: 1,
      aggregateName: userAggregateV4.name,
      aggregateVersion: userAggregateV4.version,
      aggregateId: "acct_stack",
      externalOutcome: null,
      payload: {
        id: "usr_stack",
        clerkUserId: "user_stack",
        username: null,
        displayName: null,
      },
    });
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_stack_site",
      commandName: "createSite",
      contractVersion: 1,
      pushIndex: 1,
      payload: {
        id: "sit_stack",
        userId: "usr_stack",
        slug: "stack",
        name: null,
        description: null,
      },
    });
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_stack_page",
      commandName: "createPage",
      contractVersion: 1,
      pushIndex: 2,
      payload: {
        id: "pag_stack",
        siteId: "sit_stack",
        slug: null,
        title: null,
        description: null,
      },
    });
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_stack_brick",
      commandName: "addBrick",
      contractVersion: 3,
      pushIndex: 3,
      payload: {
        id: "brk_stack",
        pageId: "pag_stack",
        moduleId: "swatch-and-icon",
        state: swatchAndIconV1.defaultState,
        target: { kind: "wall", wallId: "wal_pag_stack_lg", beforeSectionId: null },
      },
    });
    yield* harness.flush();

    const wallsBefore = yield* harness.query(owner, db.query.wall.findMany({}));
    const placementsBefore = yield* harness.query(owner, db.query.placement.findMany({}));
    const wall = wallsBefore.find((entry) => entry.breakpoint === "lg");
    const stack = wall?.layout.sections[0]?.stacks[0];
    if (wall === undefined || stack === undefined)
      expect.fail("Expected a command-created Stack in the lg Wall");

    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_stack_rename",
      commandName: "renameStack",
      contractVersion: 1,
      pushIndex: 4,
      payload: { wallId: wall.id, stackId: stack.id, name: "  Main content  " },
    });
    yield* harness.flush();
    const wallsAfter = yield* harness.query(owner, db.query.wall.findMany({}));
    const renamed = wallsAfter.find((entry) => entry.id === wall.id);
    const expected = {
      sections: [{ ...wall.layout.sections[0], stacks: [{ ...stack, name: "Main content" }] }],
    };
    expect(renamed?.layout).toEqual(expected);
    for (const otherWall of wallsBefore.filter((entry) => entry.id !== wall.id))
      expect(wallsAfter.find((entry) => entry.id === otherWall.id)).toEqual(otherWall);
    expect(yield* harness.query(owner, db.query.placement.findMany({}))).toEqual(placementsBefore);

    let pushIndex = 5;
    for (const [index, rejectedTarget] of [
      { wallId: wall.id, stackId: stack.id, name: " \t " },
      { wallId: wall.id, stackId: "stk_missing", name: "Missing" },
      { wallId: "wal_pag_stack_sm", stackId: stack.id, name: "Wrong Wall" },
    ].entries()) {
      const rejected = yield* harness
        .push({
          ...actor,
          kind: "actor",
          id: `cmd_stack_rejected_${index}`,
          commandName: "renameStack",
          contractVersion: 1,
          pushIndex: pushIndex++,
          payload: rejectedTarget,
        })
        .pipe(Effect.flip);
      expect(rejected).toMatchObject({
        code: index === 0 ? "stack-name-invalid" : "rename-stack-not-found",
      });
    }
    yield* harness.flush();
    expect(yield* harness.query(owner, db.query.wall.findMany({}))).toEqual(wallsAfter);
  }).pipe(Effect.provide(NanoIdFactory)),
);
