import { userAggregateV1 } from "../src/fresh/userAggregateV1";
import { expect, it } from "@effect/vitest";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { prepareAggregateInvocation } from "@zerospin/core/contracts/prepare/prepareAggregateInvocation";
import { Effect } from "effect";

import { system } from "../src/system";
import { setBrickBorderWidthV1 } from "../src/fresh/contracts/SetBrickBorderWidthV1";
import { makePageSnapshotV1 } from "../src/fresh/makePageSnapshotV1";
import { swatchAndIconPreviewState } from "@qrk.sh/bricks/modules/swatchAndIcon/definition/swatchAndIconPreviewState";

it.effect("decodes whole-pixel widths and rejects fractions at the actor command boundary", () =>
  Effect.gen(function* () {
    const rejected = yield* prepareAggregateInvocation({
      contract: setBrickBorderWidthV1,
      command: {
        id: "cmd_border_fraction",
        aggregateId: "acct_border",
        aggregateName: "user",
        aggregateVersion: 1,
        kind: "actor",
        actorName: "web",
        actorVersion: 1,
        claims: { aggregateId: "acct_border", clerkUserId: "user_border" },
        nodeId: "node_border",
        sessionName: "userSession",
        pushIndex: 1,
        externalOutcome: null,
        commandName: "setBrickBorderWidth",
        contractVersion: 1,
        payload: { brickId: "brk_border", borderWidth: 1.5 },
      },
      claims: { aggregateId: "acct_border", clerkUserId: "user_border" },
    }).pipe(Effect.flip);
    expect(rejected).toMatchObject({ code: "validate-command-payload-failed" });

    for (const borderWidth of [0, 12]) {
      const accepted = yield* prepareAggregateInvocation({
        contract: setBrickBorderWidthV1,
        command: {
          id: "cmd_border_whole",
          aggregateId: "acct_border",
          aggregateName: "user",
          aggregateVersion: 1,
          kind: "actor",
          actorName: "web",
          actorVersion: 1,
          claims: { aggregateId: "acct_border", clerkUserId: "user_border" },
          nodeId: "node_border",
          sessionName: "userSession",
          pushIndex: 1,
          externalOutcome: null,
          commandName: "setBrickBorderWidth",
          contractVersion: 1,
          payload: { brickId: "brk_border", borderWidth },
        },
        claims: { aggregateId: "acct_border", clerkUserId: "user_border" },
      });
      expect(accepted.payload).toEqual({ brickId: "brk_border", borderWidth });
    }
  }),
);

it.effect("keeps border changes unavailable to System commands", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    const rejected = yield* harness
      .push({
        kind: "system",
        id: "cmd_border_system",
        commandName: "setBrickBorderWidth",
        contractVersion: 1,
        aggregateName: userAggregateV1.name,
        aggregateVersion: userAggregateV1.version,
        aggregateId: "acct_border",
        externalOutcome: null,
        payload: { brickId: "brk_border", borderWidth: 1 },
      })
      .pipe(Effect.flip);
    expect(rejected).toMatchObject({ code: "system-harness-command-forbidden" });
    yield* harness.flush();
    const db = makeQueryDbVersion({ models: userAggregateV1.models });
    expect(
      yield* harness.query(
        { release: userAggregateV1, aggregateId: "acct_border" },
        db.query.brick.findMany({}),
      ),
    ).toEqual([]);
  }).pipe(Effect.provide(NanoIdFactory)),
);

it.effect(
  "creates captured preview state and preserves it through border changes across four Placements",
  () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({ system });
      const owner = { release: userAggregateV1, aggregateId: "acct_border" };
      const db = makeQueryDbVersion({ models: userAggregateV1.models });
      const actor = {
        aggregateName: userAggregateV1.name,
        aggregateVersion: userAggregateV1.version,
        aggregateId: "acct_border",
        actorName: "web",
        actorVersion: 1,
        claims: { aggregateId: "acct_border", clerkUserId: "user_border" },
        externalOutcome: null,
        nodeId: "node_border",
        sessionName: "userSession",
      };
      yield* harness.push({
        kind: "system",
        id: "cmd_border_user",
        commandName: "createUser",
        contractVersion: 1,
        aggregateName: userAggregateV1.name,
        aggregateVersion: userAggregateV1.version,
        aggregateId: "acct_border",
        externalOutcome: null,
        payload: {
          id: "usr_border",
          clerkUserId: "user_border",
          username: null,
          displayName: null,
        },
      });
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: "cmd_border_site",
        commandName: "createSite",
        contractVersion: 1,
        pushIndex: 1,
        payload: {
          id: "sit_border",
          userId: "usr_border",
          slug: "border",
          name: null,
          description: null,
        },
      });
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: "cmd_border_page",
        commandName: "createPage",
        contractVersion: 1,
        pushIndex: 2,
        payload: {
          id: "pag_border",
          siteId: "sit_border",
          slug: null,
          title: null,
          description: null,
        },
      });
      const capturedState = {
        ...swatchAndIconPreviewState,
        payload: { hash: "", color: "#123456" },
        data: { ...swatchAndIconPreviewState.data, name: "Captured icon" },
      };
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: "cmd_border_brick",
        commandName: "addSwatchAndIconBrick",
        contractVersion: 1,
        pushIndex: 3,
        payload: {
          brickId: "brk_border",
          pageId: "pag_border",
          state: capturedState,
          target: { kind: "wall", wallId: "wal_pag_border_sm", beforeSectionId: null },
        },
      });
      yield* harness.flush();
      const before = yield* harness.query(
        owner,
        db.query.brick.findFirst({ where: { id: { eq: "brk_border" } } }),
      );
      if (before === undefined) expect.fail("Expected the command-created Brick");
      expect(before).toMatchObject({ borderWidth: 0, state: capturedState });
      const placementsBefore = yield* harness.query(owner, db.query.placement.findMany({}));
      expect(placementsBefore).toHaveLength(4);
      const placedBricks = yield* harness.query(
        owner,
        db.query.placement.findMany({ with: { brick: true } }),
      );
      expect(placedBricks.map((entry) => entry.brick.state)).toEqual([
        capturedState,
        capturedState,
        capturedState,
        capturedState,
      ]);
      const wallsBefore = yield* harness.query(owner, db.query.wall.findMany({}));

      let pushIndex = 4;
      for (const borderWidth of [1, 12, 0]) {
        yield* harness.push({
          ...actor,
          kind: "actor",
          id: `cmd_border_width_${borderWidth}`,
          commandName: "setBrickBorderWidth",
          contractVersion: 1,
          pushIndex: pushIndex++,
          payload: { brickId: "brk_border", borderWidth },
        });
        yield* harness.flush();
        expect(
          yield* harness.query(
            owner,
            db.query.brick.findFirst({ where: { id: { eq: "brk_border" } } }),
          ),
        ).toMatchObject({
          borderWidth,
          state: before.state,
        });
        const placements = yield* harness.query(
          owner,
          db.query.placement.findMany({ with: { brick: true } }),
        );
        expect(placements.map((placement) => placement.brick.borderWidth)).toEqual([
          borderWidth,
          borderWidth,
          borderWidth,
          borderWidth,
        ]);
      }
      for (const borderWidth of [-1, 13]) {
        const rejected = yield* harness
          .push({
            ...actor,
            kind: "actor",
            id: `cmd_border_invalid_${borderWidth}`,
            commandName: "setBrickBorderWidth",
            contractVersion: 1,
            pushIndex: pushIndex++,
            payload: { brickId: "brk_border", borderWidth },
          })
          .pipe(Effect.flip);
        expect(rejected).toMatchObject({ code: "brick-border-width-invalid" });
      }
      yield* harness.flush();
      expect(yield* harness.query(owner, db.query.placement.findMany({}))).toEqual(
        placementsBefore,
      );
      expect(yield* harness.query(owner, db.query.wall.findMany({}))).toEqual(wallsBefore);
      expect(
        yield* harness.query(
          owner,
          db.query.brick.findFirst({ where: { id: { eq: "brk_border" } } }),
        ),
      ).toMatchObject({ borderWidth: 0 });

      for (const entry of [
        { id: "brk_null", state: null },
        { id: "brk_malformed", state: {} },
      ]) {
        const rejected = yield* harness
          .push({
            ...actor,
            kind: "actor",
            id: `cmd_${entry.id}`,
            commandName: "addSwatchAndIconBrick",
            contractVersion: 1,
            pushIndex: pushIndex++,
            payload: {
              brickId: entry.id,
              state: entry.state,
              pageId: "pag_border",
                  target: { kind: "wall", wallId: "wal_pag_border_sm", beforeSectionId: null },
            },
          })
          .pipe(Effect.flip);
        expect(rejected).toMatchObject({ code: "encode-command-payload-failed" });
      }
      const rejectedUpdate = yield* harness
        .push({
          ...actor,
          kind: "actor",
          id: "cmd_null_swatch_update",
          commandName: "updateSwatchAndIconBrick",
          contractVersion: 1,
          pushIndex: pushIndex++,
          payload: { brickId: "brk_border", state: null },
        })
        .pipe(Effect.flip);
      expect(rejectedUpdate).toMatchObject({ code: "encode-command-payload-failed" });
      yield* harness.flush();
      expect(yield* harness.query(owner, db.query.brick.findMany({}))).toHaveLength(1);
      expect(yield* harness.query(owner, db.query.placement.findMany({}))).toEqual(
        placementsBefore,
      );
      expect(
        yield* harness.query(
          owner,
          db.query.brick.findFirst({
            where: { id: { eq: "brk_border" } },
          }),
        ),
      ).toMatchObject({ state: capturedState });

      yield* harness.push({
        ...actor,
        kind: "actor",
        id: "cmd_unconfigured_link",
        commandName: "addLinkBrick",
        contractVersion: 1,
        pushIndex: pushIndex++,
        payload: {
          brickId: "brk_link",
          pageId: "pag_border",
          state: null,
          target: { kind: "wall", wallId: "wal_pag_border_sm", beforeSectionId: null },
        },
      });
      yield* harness.flush();
      expect(
        yield* harness.query(
          owner,
          db.query.brick.findFirst({
            where: { id: { eq: "brk_link" } },
          }),
        ),
      ).toMatchObject({ moduleId: "link", state: null });
      expect(
        yield* harness.query(
          owner,
          db.query.placement.findMany({
            where: { brickId: { eq: "brk_link" } },
          }),
        ),
      ).toHaveLength(4);
    }).pipe(Effect.provide(NanoIdFactory)),
);

it("includes shared border width in publication changes", () => {
  const recordedAt = new Date("2026-10-28T12:00:00Z");
  const brick = {
    id: "brk_snapshot",
    pageId: "pag_snapshot",
    moduleId: "swatch-and-icon",
    state: swatchAndIconPreviewState,
    borderWidth: 0,
    createdAt: recordedAt,
    updatedAt: recordedAt,
  } satisfies Parameters<typeof makePageSnapshotV1>[0]["bricks"][number];
  const props = {
    preferredRowSizing: true,
    preferredStackSizing: true,
    page: { slug: null, title: null, description: null },
    bricks: [brick],
    walls: [],
    placements: [],
  };
  const published = makePageSnapshotV1(props);
  const changed = makePageSnapshotV1({ ...props, bricks: [{ ...brick, borderWidth: 12 }] });

  expect(published.bricks).toEqual([
    { id: brick.id, moduleId: brick.moduleId, brickState: brick.state, borderWidth: 0 },
  ]);
  expect(changed.bricks).toEqual([
    { id: brick.id, moduleId: brick.moduleId, brickState: brick.state, borderWidth: 12 },
  ]);
  expect(changed).not.toEqual(published);
});
