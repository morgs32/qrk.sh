import { it } from "@effect/vitest";
import { decodeAndAdaptPayload } from "@zerospin/core/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload";
import { encodePayload } from "@zerospin/core/contracts/encodePayload";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect, Schema } from "effect";
import { expect } from "vitest";

import { userAggregateV12 } from "../src/aggregates/user/UserV12";
import { publishSiteV4 } from "../src/aggregates/user/contracts/publishSite/PublishSiteV4";
import { publishSiteV5 } from "../src/aggregates/user/contracts/publishSite/PublishSiteV5";
import { addBrickV6 } from "../src/aggregates/user/contracts/wall/AddBrickContractV6";
import { addBrickV7 } from "../src/aggregates/user/contracts/wall/AddBrickContractV7";
import { PageSnapshotSchemaV4 } from "../src/aggregates/user/snapshots/pageSnapshotSchemaV4";
import { PageSnapshotSchemaV5 } from "../src/aggregates/user/snapshots/pageSnapshotSchemaV5";
import { system } from "../src/system";

it.effect("adds, saves and snapshots both portfolio Bricks on the User candidate", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    const owner = { release: userAggregateV12, aggregateId: "acct_portfolio_bricks" };
    const db = makeQueryDbVersion({ models: owner.release.models });
    const actor = {
      aggregateName: "user",
      aggregateVersion: 12,
      aggregateId: owner.aggregateId,
      actorName: "web",
      actorVersion: 12,
      claims: { aggregateId: owner.aggregateId, clerkUserId: "user_portfolio_bricks" },
      externalOutcome: null,
      nodeId: "node_portfolio_bricks",
      sessionName: "userSession",
    };

    yield* harness.push({
      kind: "system",
      id: "cmd_portfolio_create_user",
      commandName: "createUser",
      contractVersion: 1,
      aggregateName: actor.aggregateName,
      aggregateVersion: actor.aggregateVersion,
      aggregateId: owner.aggregateId,
      externalOutcome: null,
      payload: {
        id: "usr_portfolio",
        clerkUserId: actor.claims.clerkUserId,
        username: null,
        displayName: null,
      },
    });
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_portfolio_create_site",
      pushIndex: 1,
      commandName: "createSite",
      contractVersion: 1,
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
      kind: "actor",
      id: "cmd_portfolio_create_page",
      pushIndex: 2,
      commandName: "createPage",
      contractVersion: 3,
      payload: {
        id: "pag_portfolio",
        siteId: "sit_portfolio",
        slug: null,
        title: null,
        description: null,
      },
    });

    const legacyBrick = {
      id: "brk_portfolio_legacy",
      pageId: "pag_portfolio",
      moduleId: "link",
      state: null,
      target: { kind: "wall", wallId: "wal_pag_portfolio_lg", beforeSectionId: null },
    } satisfies Parameters<typeof addBrickV6.evaluate>[0]["payload"];
    const legacyPayload = yield* encodePayload(addBrickV6, { version: 6, payload: legacyBrick });
    expect(
      yield* decodeAndAdaptPayload(addBrickV7, {
        command: { commandName: "addBrick", contractVersion: 6, payload: legacyPayload },
      }),
    ).toEqual(legacyBrick);
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_portfolio_add_legacy",
      pushIndex: 3,
      commandName: "addBrick",
      contractVersion: 7,
      payload: legacyBrick,
    });

    const legacyPublish = {
      siteId: "sit_portfolio",
      pages: [{ pageId: "pag_portfolio", snapshotId: "psn_portfolio_legacy" }],
      preferredRowSizing: false,
    } satisfies Parameters<typeof publishSiteV4.evaluate>[0]["payload"];
    const publishedPayload = yield* encodePayload(publishSiteV4, {
      version: 4,
      payload: legacyPublish,
    });
    expect(
      yield* decodeAndAdaptPayload(publishSiteV5, {
        command: { commandName: "publishSite", contractVersion: 4, payload: publishedPayload },
      }),
    ).toEqual(legacyPublish);
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_portfolio_publish_legacy",
      pushIndex: 4,
      commandName: "publishSite",
      contractVersion: 5,
      payload: legacyPublish,
    });
    const legacy = yield* harness.query(
      owner,
      db.query.pageSnapshot.findFirst({
        where: { id: { eq: "psn_portfolio_legacy" } },
      }),
    );
    expect(Schema.decodeUnknownSync(PageSnapshotSchemaV4)(legacy?.content)).toEqual(
      legacy?.content,
    );
    expect(legacy?.content).not.toHaveProperty("rowSizing");

    const fixtures = [
      {
        moduleId: "behance",
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
        state: {
          payload: { url: "https://buymeacoffee.com/example", message: "Thanks for your support." },
        },
      },
    ];
    let pushIndex = 5;
    for (const fixture of fixtures) {
      const { moduleId, state } = fixture;
      const id: `brk_${string}` = `brk_portfolio_${moduleId}`;
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: `cmd_add_${moduleId}`,
        pushIndex: pushIndex++,
        commandName: "addBrick",
        contractVersion: 7,
        payload: { ...legacyBrick, id, moduleId },
      });
      const brickQuery = db.query.brick.findFirst({ where: { id: { eq: id } } });
      expect((yield* harness.query(owner, brickQuery))?.state).toBeNull();
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: `cmd_save_${moduleId}`,
        pushIndex: pushIndex++,
        commandName: "updateBrick",
        contractVersion: 7,
        payload: { brickId: id, moduleId, state },
      });
      const rejected = yield* harness
        .push({
          ...actor,
          kind: "actor",
          id: `cmd_reject_${moduleId}`,
          pushIndex: pushIndex++,
          commandName: "updateBrick",
          contractVersion: 7,
          payload: {
            brickId: id,
            moduleId,
            state: { ...state, payload: { ...state.payload, url: "https://example.com/invalid" } },
          },
        })
        .pipe(Effect.flip);
      expect(rejected).toMatchObject({ code: "update-brick-invalid-state" });
      expect((yield* harness.query(owner, brickQuery))?.state).toEqual(state);
    }
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_portfolio_publish",
      pushIndex,
      commandName: "publishPage",
      contractVersion: 5,
      payload: {
        pageId: "pag_portfolio",
        snapshotId: "psn_portfolio_current",
        preferredRowSizing: true,
      },
    });
    yield* harness.flush();
    const saved = yield* harness.query(
      owner,
      db.query.pageSnapshot.findFirst({
        where: { id: { eq: "psn_portfolio_current" } },
      }),
    );
    const snapshot = Schema.decodeUnknownSync(PageSnapshotSchemaV5)(saved?.content);
    expect(snapshot.rowSizing).toBe("preferred");
    expect(snapshot.bricks).toHaveLength(3);
    for (const fixture of fixtures)
      expect(snapshot.bricks).toContainEqual(expect.objectContaining(fixture));
    expect(snapshot.walls).toHaveLength(4);
  }).pipe(Effect.provide(NanoIdFactory)),
);
