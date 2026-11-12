import { it } from "@effect/vitest";
import { decodeAndAdaptPayload } from "@zerospin/core/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload";
import { encodePayload } from "@zerospin/core/contracts/encodePayload";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect } from "effect";
import { expect } from "vitest";
import { userAggregateV14 } from "../src/aggregates/user/UserV14";
import { deleteStackV1 } from "../src/aggregates/user/contracts/wall/DeleteStackContractV1";
import { deleteStackV2 } from "../src/aggregates/user/contracts/wall/DeleteStackContractV2";
import { system } from "../src/system";

it.effect("deletes a Stack at one width or all widths and rejects a stale confirmation", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    const owner = { release: userAggregateV14, aggregateId: "acct_delete_stack" };
    const db = makeQueryDbVersion({ models: owner.release.models });
    const scope = {
      aggregateName: "user",
      aggregateVersion: 14,
      aggregateId: owner.aggregateId,
      externalOutcome: null,
    };
    const actor = {
      ...scope,
      kind: "actor" as const,
      actorName: "web",
      actorVersion: 14,
      claims: { aggregateId: owner.aggregateId, clerkUserId: "user_delete_stack" },
      nodeId: "node_delete_stack",
      sessionName: "userSession",
    };
    yield* harness.push({
      ...scope,
      kind: "system",
      id: "cmd_stack_create_user",
      commandName: "createUser",
      contractVersion: 1,
      payload: {
        id: "usr_delete_stack",
        clerkUserId: actor.claims.clerkUserId,
        username: null,
        displayName: null,
      },
    });
    yield* harness.push({
      ...actor,
      id: "cmd_stack_create_site",
      pushIndex: 1,
      commandName: "createSite",
      contractVersion: 1,
      payload: {
        id: "sit_delete_stack",
        userId: "usr_delete_stack",
        slug: "stack",
        name: null,
        description: null,
      },
    });
    yield* harness.push({
      ...actor,
      id: "cmd_stack_create_page",
      pushIndex: 2,
      commandName: "createPage",
      contractVersion: 3,
      payload: {
        id: "pag_delete_stack",
        siteId: "sit_delete_stack",
        slug: null,
        title: null,
        description: null,
      },
    });
    yield* harness.push({
      ...actor,
      id: "cmd_stack_add_brick",
      pushIndex: 3,
      commandName: "addBrick",
      contractVersion: 7,
      payload: {
        id: "brk_delete_stack",
        pageId: "pag_delete_stack",
        moduleId: "link",
        state: null,
        target: { kind: "wall", wallId: "wal_pag_delete_stack_lg", beforeSectionId: null },
      },
    });

    const walls = db.query.wall.findMany();
    const placements = db.query.placement.findMany();
    const brick = db.query.brick.findFirst({ where: { id: { eq: "brk_delete_stack" } } });
    const savedWalls = yield* harness.query(owner, walls);
    const lg = savedWalls.find((entry) => entry.breakpoint === "lg");
    const md = savedWalls.find((entry) => entry.breakpoint === "md");
    const lgStack = lg?.layout.sections[0]?.stacks[0];
    const mdStack = md?.layout.sections[0]?.stacks[0];
    if (!lg || !md || !lgStack || !mdStack) throw new Error("Missing Stack fixtures");
    const legacy = { wallId: lg.id, stackId: lgStack.id, allWidths: false };
    const encodedLegacy = yield* encodePayload(deleteStackV1, { version: 1, payload: legacy });
    expect(
      yield* decodeAndAdaptPayload(deleteStackV2, {
        command: { commandName: "deleteStack", contractVersion: 1, payload: encodedLegacy },
      }),
    ).toEqual({ ...legacy, placementIds: null });
    const deleteAtLg = {
      ...actor,
      id: "cmd_stack_delete_lg",
      pushIndex: 5,
      commandName: "deleteStack",
      contractVersion: 2,
      payload: {
        wallId: lg.id,
        stackId: lgStack.id,
        placementIds: lgStack.rows.flatMap((row) => row.placementIds),
        allWidths: false,
      },
    } satisfies Parameters<typeof harness.push>[0];
    const stale = yield* harness
      .push({
        ...deleteAtLg,
        id: "cmd_stack_delete_stale",
        pushIndex: 4,
        payload: { ...deleteAtLg.payload, placementIds: [] },
      })
      .pipe(Effect.flip);
    expect(stale).toMatchObject({ code: "delete-stack-invalid" });
    expect(yield* harness.query(owner, placements)).toHaveLength(4);

    yield* harness.push(deleteAtLg);
    yield* harness.flush();
    expect(
      (yield* harness.query(owner, walls)).find((entry) => entry.id === lg.id)?.layout.sections,
    ).toEqual([]);
    expect(yield* harness.query(owner, placements)).toHaveLength(3);
    yield* harness.push({
      ...actor,
      id: "cmd_stack_update_retained_brick",
      pushIndex: 6,
      commandName: "updateBrick",
      contractVersion: 8,
      payload: { brickId: "brk_delete_stack", moduleId: "link", state: null },
    });
    expect((yield* harness.query(owner, brick))?.stateRevision).toBe(1);

    yield* harness.push({
      ...deleteAtLg,
      id: "cmd_stack_delete_all",
      pushIndex: 7,
      payload: {
        wallId: md.id,
        stackId: mdStack.id,
        placementIds: mdStack.rows.flatMap((row) => row.placementIds),
        allWidths: true,
      },
    });
    yield* harness.flush();
    expect(yield* harness.query(owner, brick)).toBeUndefined();
    expect(yield* harness.query(owner, placements)).toEqual([]);
    for (const wall of yield* harness.query(owner, walls)) expect(wall.layout.sections).toEqual([]);
  }).pipe(Effect.provide(NanoIdFactory)),
);
