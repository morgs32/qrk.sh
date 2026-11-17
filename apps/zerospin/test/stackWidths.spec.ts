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
import { makeQueryDbVersion, makeSystemSpec, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { prepareAggregateInvocation } from "@zerospin/core/contracts/prepare/prepareAggregateInvocation";
import { Effect, Result, Schema } from "effect";
import { expect } from "vitest";
import { userAggregateV1 } from "../src/fresh/userAggregateV1";
import { setStackWidthWeightsV1 } from "../src/fresh/contracts/wall/SetStackWidthWeightsV1";
import {
  movePlacementToNewStackInLayout,
  moveStackInLayout,
  removePlacementFromLayout,
} from "@qrk.sh/bricks/zerospin/wall/wallLayout";
import { insertPlacementInLayout } from "@qrk.sh/bricks/zerospin/wall/insertPlacementInLayout";
import type { wallLayoutSchema } from "@qrk.sh/bricks/zerospin/models/wall/wallLayoutSchema";
import { pageSnapshotSchema } from "@qrk.sh/bricks/zerospin/models/pageSnapshot/pageSnapshotSchema";
import { system } from "../src/system";

it.effect("validates positive finite Stack weights at the command boundary", () =>
  Effect.gen(function* () {
    const payload = {
      wallId: "wal_stack_width",
      sectionId: "sec_stack_width",
      leftStackId: "stk_left",
      rightStackId: "stk_right",
      leftWeight: 1.5,
      rightWeight: 0.5,
    };
    const accepted = yield* prepareAggregateInvocation({
      contract: setStackWidthWeightsV1,
      command: {
        id: "cmd_stack_width",
        aggregateId: "acct_stack_width",
        aggregateName: "user",
        aggregateVersion: 1,
        kind: "actor",
        actorName: "web",
        actorVersion: 1,
        claims: { aggregateId: "acct_stack_width", clerkUserId: "clerk_stack_width" },
        nodeId: "node_stack_width",
        sessionName: "userSession",
        pushIndex: 1,
        externalOutcome: null,
        commandName: "setStackWidthWeights",
        contractVersion: 1,
        payload,
      },
      claims: { aggregateId: "acct_stack_width", clerkUserId: "clerk_stack_width" },
    });
    expect(accepted.payload).toEqual(payload);
    for (const weight of [0, -1]) {
      const rejected = yield* prepareAggregateInvocation({
        contract: setStackWidthWeightsV1,
        command: {
          id: "cmd_stack_width_invalid",
          aggregateId: "acct_stack_width",
          aggregateName: "user",
          aggregateVersion: 1,
          kind: "actor",
          actorName: "web",
          actorVersion: 1,
          claims: { aggregateId: "acct_stack_width", clerkUserId: "clerk_stack_width" },
          nodeId: "node_stack_width",
          sessionName: "userSession",
          pushIndex: 1,
          externalOutcome: null,
          commandName: "setStackWidthWeights",
          contractVersion: 1,
          payload: { ...payload, leftWeight: weight },
        },
        claims: { aggregateId: "acct_stack_width", clerkUserId: "clerk_stack_width" },
      }).pipe(Effect.flip);
      expect(rejected).toMatchObject({ code: "encode-command-json-payload-field-failed" });
    }
  }),
);

it.effect("decodes published snapshots with and without saved Stack weights", () =>
  Effect.sync(() => {
    const content = {
      slug: "home",
      title: "Home",
      description: null,
      bricks: [],
      walls: [
        {
          id: "wal_stack_width",
          breakpoint: "lg",
          sections: [
            {
              id: "sec_stack_width",
              stacks: [{ id: "stk_left", name: "Stack", rows: [] }],
            },
          ],
        },
      ],
    };
    expect(Schema.decodeUnknownSync(pageSnapshotSchema)(content)).toEqual(content);
    const weighted = {
      ...content,
      walls: content.walls.map((wall) => ({
        ...wall,
        sections: wall.sections.map((section) => ({
          ...section,
          stacks: section.stacks.map((stack) => ({ ...stack, widthWeight: 2 })),
        })),
      })),
    };
    expect(
      Schema.decodeUnknownSync(pageSnapshotSchema)(weighted).walls[0].sections[0].stacks[0],
    ).toMatchObject({ widthWeight: 2 });
  }),
);

it.effect("registers Stack width in the current System", () =>
  Effect.gen(function* () {
    expect(system.aggregates.user.canonical).toBe(1);
    expect(system.aggregates.user.releases[1]).toBe(userAggregateV1);
    expect(userAggregateV1.actors.web.contracts.setStackWidthWeights.version).toBe(1);
    expect(() => makeSystemSpec({ system })).not.toThrow();

    const harness = yield* makeSystemHarness({ system });
    yield* harness.push({
      kind: "system",
      id: "cmd_stack_width_user",
      commandName: "createUser",
      contractVersion: 1,
      aggregateName: "user",
      aggregateVersion: 1,
      aggregateId: "acct_stack_width",
      externalOutcome: null,
      payload: {
        id: "usr_stack_width",
        clerkUserId: "clerk_stack_width",
        displayName: null,
      },
    });
    yield* harness.flush();
    const db = makeQueryDbVersion({ models: userAggregateV1.models });
    const user = yield* harness.query(
      { release: userAggregateV1, aggregateId: "acct_stack_width" },
      db.query.user.findFirst({ where: { id: { eq: "usr_stack_width" } } }),
    );
    expect(user?.clerkUserId).toBe("clerk_stack_width");
  }).pipe(Effect.provide(NanoIdFactory)),
);

it.effect("keeps Stack proportions through insertions and movement", () =>
  Effect.sync(() => {
    const layout: typeof wallLayoutSchema.Type = {
      sections: [
        {
          id: "sec_source",
          stacks: [
            {
              id: "stk_a",
              name: "A",
              widthWeight: 1,
              rows: [{ id: "row_a", minHeight: null, placementIds: ["plc_a", "plc_b"] }],
            },
            {
              id: "stk_b",
              name: "B",
              widthWeight: 2,
              rows: [{ id: "row_b", minHeight: null, placementIds: ["plc_c"] }],
            },
          ],
        },
        {
          id: "sec_destination",
          stacks: [
            { id: "stk_c", name: "C", widthWeight: 4, rows: [] },
            { id: "stk_d", name: "D", widthWeight: 8, rows: [] },
          ],
        },
      ],
    };

    const inserted = insertPlacementInLayout({
      layout,
      target: { kind: "section", wallId: "wal_test", sectionId: "sec_source" },
      placementId: "plc_new",
      newNodeIds: { sectionId: "sec_new", stackId: "stk_new", rowId: "row_new" },
    });
    expect(Result.isSuccess(inserted)).toBe(true);
    if (Result.isFailure(inserted)) throw new Error(inserted.failure);
    expect(inserted.success.sections[0].stacks.map((stack) => stack.widthWeight)).toEqual([
      1, 2, 1.5,
    ]);

    const movedPlacement = movePlacementToNewStackInLayout({
      layout,
      placementId: "plc_a",
      sectionId: "sec_source",
      newStackId: "stk_new",
      newRowId: "row_new",
    });
    expect(Result.isSuccess(movedPlacement)).toBe(true);
    if (Result.isFailure(movedPlacement)) throw new Error(movedPlacement.failure);
    expect(movedPlacement.success.sections[0].stacks.map((stack) => stack.widthWeight)).toEqual([
      1, 2, 1.5,
    ]);

    const reordered = moveStackInLayout({
      layout,
      target: {
        kind: "section",
        wallId: "wal_test",
        sectionId: "sec_source",
        beforeStackId: "stk_a",
      },
      stackId: "stk_b",
      newSectionId: "sec_new",
    });
    expect(Result.isSuccess(reordered)).toBe(true);
    if (Result.isFailure(reordered)) throw new Error(reordered.failure);
    expect(
      reordered.success.sections[0].stacks.map((stack) => [stack.id, stack.widthWeight]),
    ).toEqual([
      ["stk_b", 2],
      ["stk_a", 1],
    ]);

    const movedStack = moveStackInLayout({
      layout,
      target: {
        kind: "section",
        wallId: "wal_test",
        sectionId: "sec_destination",
        beforeStackId: null,
      },
      stackId: "stk_a",
      newSectionId: "sec_new",
    });
    expect(Result.isSuccess(movedStack)).toBe(true);
    if (Result.isFailure(movedStack)) throw new Error(movedStack.failure);
    expect(movedStack.success.sections[0].stacks.map((stack) => stack.widthWeight)).toEqual([2]);
    expect(movedStack.success.sections[1].stacks.map((stack) => stack.widthWeight)).toEqual([
      4, 8, 6,
    ]);

    const removed = removePlacementFromLayout({ layout, placementId: "plc_c" });
    expect(Result.isSuccess(removed)).toBe(true);
    if (Result.isFailure(removed)) throw new Error(removed.failure);
    expect(removed.success.sections[0].stacks.map((stack) => stack.widthWeight)).toEqual([1]);
    expect(layout.sections[0].stacks.map((stack) => stack.widthWeight)).toEqual([1, 2]);
  }),
);

it.effect("keeps the equal default omitted when editing historical layouts", () =>
  Effect.sync(() => {
    const layout: typeof wallLayoutSchema.Type = {
      sections: [
        {
          id: "sec_old",
          stacks: [
            {
              id: "stk_old",
              name: "Old",
              rows: [{ id: "row_old", minHeight: null, placementIds: ["plc_old", "plc_other"] }],
            },
          ],
        },
        { id: "sec_next", stacks: [{ id: "stk_next", name: "Next", rows: [] }] },
      ],
    };
    const inserted = insertPlacementInLayout({
      layout,
      target: { kind: "section", wallId: "wal_test", sectionId: "sec_old" },
      placementId: "plc_new",
      newNodeIds: { sectionId: "sec_new", stackId: "stk_new", rowId: "row_new" },
    });
    if (Result.isFailure(inserted)) throw new Error(inserted.failure);
    expect(inserted.success.sections[0].stacks).toHaveLength(2);
    expect(inserted.success.sections[0].stacks[1]).not.toHaveProperty("widthWeight");

    const movedPlacement = movePlacementToNewStackInLayout({
      layout,
      placementId: "plc_old",
      sectionId: "sec_old",
      newStackId: "stk_new",
      newRowId: "row_new",
    });
    if (Result.isFailure(movedPlacement)) throw new Error(movedPlacement.failure);
    expect(movedPlacement.success.sections[0].stacks[1]).not.toHaveProperty("widthWeight");

    const movedStack = moveStackInLayout({
      layout,
      target: { kind: "section", wallId: "wal_test", sectionId: "sec_next", beforeStackId: null },
      stackId: "stk_old",
      newSectionId: "sec_new",
    });
    if (Result.isFailure(movedStack)) throw new Error(movedStack.failure);
    expect(movedStack.success.sections[0].stacks[1]).not.toHaveProperty("widthWeight");
  }),
);

it.effect("preserves the smallest positive Stack weight when computing a destination mean", () =>
  Effect.sync(() => {
    const layout: typeof wallLayoutSchema.Type = {
      sections: [
        {
          id: "sec_small",
          stacks: [
            { id: "stk_small_a", name: "A", widthWeight: Number.MIN_VALUE, rows: [] },
            { id: "stk_small_b", name: "B", widthWeight: Number.MIN_VALUE, rows: [] },
          ],
        },
        {
          id: "sec_source",
          stacks: [
            {
              id: "stk_source",
              name: "Source",
              rows: [{ id: "row_source", minHeight: null, placementIds: ["plc_source"] }],
            },
          ],
        },
      ],
    };
    const inserted = insertPlacementInLayout({
      layout,
      target: { kind: "section", wallId: "wal_test", sectionId: "sec_small" },
      placementId: "plc_new",
      newNodeIds: { sectionId: "sec_new", stackId: "stk_new", rowId: "row_new" },
    });
    if (Result.isFailure(inserted)) throw new Error(inserted.failure);
    expect(inserted.success.sections[0].stacks[2].widthWeight).toBe(Number.MIN_VALUE);

    const moved = moveStackInLayout({
      layout,
      target: { kind: "section", wallId: "wal_test", sectionId: "sec_small", beforeStackId: null },
      stackId: "stk_source",
      newSectionId: "sec_new",
    });
    if (Result.isFailure(moved)) throw new Error(moved.failure);
    expect(moved.success.sections[0].stacks[2].widthWeight).toBe(Number.MIN_VALUE);
  }),
);
