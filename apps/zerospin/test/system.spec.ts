import { expect, it } from "@effect/vitest";
import * as sdk from "@zerospin/sdk";
import { applyOperationTx } from "@zerospin/core/contracts/applyOperationTx";
import { makeContractReadDb } from "@zerospin/core/contracts/make/makeContractReadDb";
import type { IAnyOperation } from "@zerospin/core/contracts/types";
import { makeResourceDbConfig } from "@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig";
import { makeTx } from "@zerospin/core/drizzle/make/makeTx";
import { openHarnessDb } from "@zerospin/core/testing/systemHarness/openHarnessDb";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { prepareAggregateInvocation } from "@zerospin/core/contracts/prepare/prepareAggregateInvocation";
import { Effect } from "effect";
import { newHttpBatchRpcResponse, RpcTarget } from "capnweb";
import { vi } from "vitest";

import { system } from "../src/system";
import { userAggregateV1 } from "../src/aggregates/user/UserV1";
import { generateBrickSpecV1 } from "../src/aggregates/user/contracts/brick/GenerateBrickSpecV1";
import { generateBrickSpecExternalV1 } from "../src/aggregates/user/contracts/brick/GenerateBrickSpecExternalV1";
import { generateBrickSpecExternalDefinitionV1 } from "../src/aggregates/user/contracts/brick/GenerateBrickSpecExternalDefinitionV1";
import { publishPageV1 } from "../src/aggregates/user/contracts/publishPage/PublishPageV1";
import { createSiteV1 } from "../src/aggregates/user/contracts/createSite/CreateSiteV1";
import { updateSiteSettingsV1 } from "../src/aggregates/user/contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { makePlacementId } from "../src/modules/lib/makePlacementId";
import { swatchAndIconV1 } from "../src/modules/swatchAndIcon/swatchAndIconV1";

vi.mock("cloudflare:workers", () => ({ env: { QRK_LIBRARY_API_URL: "https://api.qrk.test/rpc" } }));

it.effect(
  "creates a user through a command and keeps site creation unavailable to System commands",
  () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({ system });
      yield* harness.push({
        kind: "system",
        id: "cmd_create_user",
        commandName: "createUser",
        contractVersion: 1,
        aggregateName: userAggregateV1.name,
        aggregateVersion: userAggregateV1.version,
        aggregateId: "acct_harness",
        externalOutcome: null,
        payload: {
          id: "usr_harness",
          clerkUserId: "user_harness",
          username: null,
          displayName: null,
        },
      });
      const db = sdk.makeQueryDbVersion({ models: userAggregateV1.models });
      expect(
        yield* harness.query(
          { release: userAggregateV1, aggregateId: "acct_harness" },
          db.query.user.findFirst({ where: { id: { eq: "usr_harness" } } }),
        ),
      ).toMatchObject({ clerkUserId: "user_harness" });
      const rejected = yield* harness
        .push({
          kind: "system",
          id: "cmd_create_site",
          commandName: "createSite",
          contractVersion: 1,
          aggregateName: userAggregateV1.name,
          aggregateVersion: userAggregateV1.version,
          aggregateId: "acct_harness",
          externalOutcome: null,
          payload: {
            id: "sit_harness",
            userId: "usr_harness",
            slug: "example",
            name: null,
            description: null,
          },
        })
        .pipe(Effect.flip);
      expect(rejected).toMatchObject({ code: "system-harness-command-forbidden" });
      yield* harness.flush();
      expect(
        yield* harness.query(
          { release: userAggregateV1, aggregateId: "acct_harness" },
          db.query.site.findMany({}),
        ),
      ).toEqual([]);
    }).pipe(Effect.provide(sdk.NanoIdFactory)),
);

const recordedAt = new Date("2026-10-22T12:00:00Z");
const placementId = makePlacementId("brk_one", "lg");
const generatedSpec = {
  root: "color",
  elements: { color: { type: "SwatchAndIconColor", props: { color: "#123456" } } },
};

// Method-level seam: initial seed precedes execution; every later write replays
// operations emitted by the actual contracts. The System harness has no seed API.
const openGenerationDb = (siteIsPublished = false) =>
  Effect.gen(function* () {
    const config = makeResourceDbConfig({ models: userAggregateV1.models });
    const db = yield* openHarnessDb(config);
    const readDb = makeContractReadDb({ db, models: userAggregateV1.models });
    const timestamps = { createdAt: recordedAt, updatedAt: recordedAt };
    db.transaction((tx) => {
      tx.insert(config.schema.user)
        .values({
          ...timestamps,
          id: "usr_one",
          clerkUserId: "user_one",
          username: null,
          displayName: null,
        })
        .run();
      tx.insert(config.schema.site)
        .values({
          ...timestamps,
          id: "sit_one",
          userId: "usr_one",
          slug: null,
          name: null,
          description: null,
          logoUrl: null,
          faviconLightUrl: null,
          faviconDarkUrl: null,
          isPublished: siteIsPublished,
          stickyNavbar: true,
          cardStyle: false,
          brickGap: 1,
        })
        .run();
      tx.insert(config.schema.page)
        .values({
          ...timestamps,
          id: "pag_one",
          siteId: "sit_one",
          slug: null,
          title: null,
          description: null,
          isPublished: false,
          publishedSnapshotId: null,
        })
        .run();
      tx.insert(config.schema.wall)
        .values({
          ...timestamps,
          id: "wal_one",
          pageId: "pag_one",
          breakpoint: "lg",
          layout: JSON.stringify({
            sections: [
              {
                id: "sec_one",
                stacks: [
                  {
                    id: "stk_one",
                    name: "",
                    rows: [{ id: "row_one", placementIds: [placementId] }],
                  },
                ],
              },
            ],
          }),
        })
        .run();
      tx.insert(config.schema.brick)
        .values({
          ...timestamps,
          id: "brk_one",
          pageId: "pag_one",
          moduleId: "swatch-and-icon",
          stateRevision: 0,
          state: JSON.stringify(swatchAndIconV1.defaultState),
        })
        .run();
      tx.insert(config.schema.placement)
        .values({
          ...timestamps,
          id: placementId,
          brickId: "brk_one",
          wallId: "wal_one",
          variantId: "default",
          specRevision: 0,
          generation: null,
          spec: JSON.stringify(swatchAndIconV1.defaultSpec),
        })
        .run();
    });
    const replay = (operation: IAnyOperation) =>
      makeTx("generation.replay")(function* (tx) {
        yield* applyOperationTx({
          tx,
          operation,
          commandId: "cmd_generation",
          operationIndex: 0,
          appliedAt: recordedAt,
        });
      })(db);
    const start = (requestId: string) =>
      Effect.gen(function* () {
        const requested = yield* generateBrickSpecV1.evaluate({
          aggregateId: "acct_harness",
          claims: null,
          db: readDb,
          payload: { brickId: "brk_one", breakpoint: "lg", requestId, prompt: "  Make it green  " },
        });
        expect(requested.operations.map((operation) => operation.operationName)).toEqual([
          "update",
          "external",
        ]);
        const [update, external] = requested.operations;
        if (update?.operationName !== "update" || external?.operationName !== "external") {
          expect.fail("Expected Placement update followed by external generation");
        }
        yield* replay(update);
        return external;
      });
    return { db: readDb, replay, start };
  });

it.effect("defaults new sites to a 1px gap and saves gaps from 0 to 12 pixels", () =>
  Effect.gen(function* () {
    const { db, replay } = yield* openGenerationDb();
    const created = yield* createSiteV1.evaluate({
      aggregateId: "acct_harness",
      claims: { clerkUserId: "user_one" },
      db,
      payload: { id: "sit_gap", userId: "usr_one", slug: "gap", name: null, description: null },
    });
    for (const operation of created.operations) yield* replay(operation);
    expect(
      yield* sdk.findFirst({
        db,
        model: userAggregateV1.models.site,
        where: { id: { eq: "sit_gap" } },
      }),
    ).toMatchObject({ brickGap: 1 });

    for (const brickGap of [0, 6, 12]) {
      const saved = yield* updateSiteSettingsV1.evaluate({
        aggregateId: "acct_harness",
        claims: { clerkUserId: "user_one" },
        db,
        payload: {
          id: "sit_gap",
          name: null,
          description: null,
          logoUrl: null,
          faviconLightUrl: null,
          faviconDarkUrl: null,
          cardStyle: false,
          stickyNavbar: true,
          brickGap,
        },
      });
      for (const operation of saved.operations) yield* replay(operation);
      expect(
        yield* sdk.findFirst({
          db,
          model: userAggregateV1.models.site,
          where: { id: { eq: "sit_gap" } },
        }),
      ).toMatchObject({ brickGap });
    }

    for (const brickGap of [-1, 13]) {
      const rejected = yield* updateSiteSettingsV1
        .evaluate({
          aggregateId: "acct_harness",
          claims: { clerkUserId: "user_one" },
          db,
          payload: {
            id: "sit_gap",
            name: null,
            description: null,
            logoUrl: null,
            faviconLightUrl: null,
            faviconDarkUrl: null,
            cardStyle: false,
            stickyNavbar: true,
            brickGap,
          },
        })
        .pipe(Effect.flip);
      expect(rejected).toMatchObject({ code: "site-brick-gap-invalid" });
    }
    expect(
      yield* sdk.findFirst({
        db,
        model: userAggregateV1.models.site,
        where: { id: { eq: "sit_gap" } },
      }),
    ).toMatchObject({ brickGap: 12 });
  }),
);

it.effect("rejects fractional brick gaps at the actor command decoding boundary", () =>
  Effect.gen(function* () {
    const rejected = yield* prepareAggregateInvocation({
      contract: updateSiteSettingsV1,
      command: {
        aggregateId: "acct_harness",
        payload: {
          id: "sit_gap",
          name: null,
          description: null,
          logoUrl: null,
          faviconLightUrl: null,
          faviconDarkUrl: null,
          cardStyle: false,
          stickyNavbar: true,
          brickGap: 1.5,
        },
      },
      claims: { aggregateId: "acct_harness", clerkUserId: "user_one" },
    }).pipe(Effect.flip);
    expect(rejected).toMatchObject({ code: "validate-command-payload-failed" });
  }),
);

it.effect("records canonical generation inputs and commits the validated external spec", () =>
  Effect.gen(function* () {
    const { db, replay, start } = yield* openGenerationDb();
    const external = yield* start("req_one");
    expect(userAggregateV1.contracts.generateBrickSpec).toBe(generateBrickSpecV1);
    expect(userAggregateV1.contracts.generateBrickSpecExternal).toBe(generateBrickSpecExternalV1);
    expect(external.contract).toBe(generateBrickSpecExternalDefinitionV1);
    expect(external.payload).toEqual({
      brickId: "brk_one",
      breakpoint: "lg",
      moduleId: "swatch-and-icon",
      requestId: "req_one",
      prompt: "Make it green",
      baseStateRevision: 0,
      baseSpecRevision: 0,
      state: swatchAndIconV1.defaultState,
      currentSpec: swatchAndIconV1.defaultSpec,
    });
    class LibraryApiFixture extends RpcTarget {
      generateSpec(moduleId: string, prompt: string, state: unknown, currentSpec: unknown) {
        expect([moduleId, prompt, state, currentSpec]).toEqual([
          external.payload.moduleId,
          external.payload.prompt,
          external.payload.state,
          external.payload.currentSpec,
        ]);
        return Promise.resolve({ _tag: "Right", right: generatedSpec });
      }
    }
    const requests: Request[] = [];
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const request = new Request(input, init);
      expect(request.url).toBe("https://api.qrk.test/rpc");
      requests.push(request);
      return newHttpBatchRpcResponse(request, new LibraryApiFixture());
    });
    yield* Effect.addFinalizer(() => Effect.sync(() => fetch.mockRestore()));
    const requestGeneration: (
      props: Parameters<typeof generateBrickSpecExternalV1.external.request>[0],
    ) => ReturnType<typeof generateBrickSpecExternalV1.external.request> =
      generateBrickSpecExternalV1.external.request;
    const response = yield* requestGeneration({ payload: external.payload });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.signal.aborted).toBe(true);
    const completed = yield* generateBrickSpecExternalV1.evaluate({
      aggregateId: "acct_harness",
      claims: null,
      payload: external.payload,
      db,
      externalOutcome: { _tag: "Success", success: response, recordedAt },
    });
    expect(completed.operations).toHaveLength(1);
    const update = completed.operations[0];
    if (update?.operationName !== "update") expect.fail("Expected generated Placement update");
    yield* replay(update);
    expect(
      yield* sdk.findFirst({
        db,
        model: userAggregateV1.models.placement,
        where: { id: { eq: placementId } },
      }),
    ).toMatchObject({
      spec: generatedSpec,
      specRevision: 1,
      generation: { requestId: "req_one", status: "ready", error: null },
    });
  }),
);

it.effect("ignores superseded generation requests", () =>
  Effect.gen(function* () {
    const { db, start } = yield* openGenerationDb();
    const first = yield* start("req_old");
    yield* start("req_new");
    const superseded = yield* generateBrickSpecExternalV1.evaluate({
      aggregateId: "acct_harness",
      claims: null,
      payload: first.payload,
      db,
      externalOutcome: {
        _tag: "Success",
        success: { _tag: "Right", right: generatedSpec },
        recordedAt,
      },
    });
    expect(superseded.operations).toEqual([]);
  }),
);

it.effect("publishes a page and replaces its published snapshot through the same contract", () =>
  Effect.gen(function* () {
    const { db, replay } = yield* openGenerationDb(true);
    for (const snapshotId of ["psn_first", "psn_updates"] as const) {
      const published = yield* publishPageV1.evaluate({
        aggregateId: "acct_harness",
        claims: { aggregateId: "acct_harness", clerkUserId: "user_one" },
        db,
        payload: { pageId: "pag_one", snapshotId },
      });
      for (const operation of published.operations) yield* replay(operation);
      expect(
        yield* sdk.findFirst({
          db,
          model: userAggregateV1.models.page,
          where: { id: { eq: "pag_one" } },
        }),
      ).toMatchObject({
        isPublished: true,
        publishedSnapshotId: snapshotId,
      });
    }
    expect(
      yield* sdk.findMany({
        db,
        model: userAggregateV1.models.pageSnapshot,
        where: { pageId: { eq: "pag_one" } },
      }),
    ).toHaveLength(2);
  }),
);

it.effect("rejects page publication for another identity or an unpublished site", () =>
  Effect.gen(function* () {
    const { db } = yield* openGenerationDb();
    for (const [clerkUserId, code] of [
      ["user_other", "publish-page-user-mismatch"],
      ["user_one", "publish-page-unavailable"],
    ]) {
      const rejected = yield* publishPageV1
        .evaluate({
          aggregateId: "acct_harness",
          claims: { aggregateId: "acct_harness", clerkUserId },
          db,
          payload: { pageId: "pag_one", snapshotId: "psn_rejected" },
        })
        .pipe(Effect.flip);
      expect(rejected).toMatchObject({ code });
    }
    expect(
      yield* sdk.findMany({
        db,
        model: userAggregateV1.models.pageSnapshot,
        where: { pageId: { eq: "pag_one" } },
      }),
    ).toEqual([]);
  }),
);

it.effect(
  "turns recorded request failures, provider rejections and invalid specs into failed generation",
  () =>
    Effect.gen(function* () {
      const { db, start } = yield* openGenerationDb();
      const external = yield* start("req_one");
      const cases = [
        {
          outcome: {
            _tag: "Failure",
            failure: {
              _tag: "ExternalRequestFailure",
              code: "external-request-failed",
              message: "LibraryApi was unavailable",
            },
            recordedAt,
          },
          error: {
            code: "external-request-failed",
            message: "LibraryApi was unavailable",
            retryable: true,
          },
        },
        {
          outcome: {
            _tag: "Success",
            success: {
              _tag: "Left",
              left: {
                code: "generation-rejected",
                message: "Unsupported request",
                retryable: false,
              },
            },
            recordedAt,
          },
          error: { code: "generation-rejected", message: "Unsupported request", retryable: false },
        },
        {
          outcome: {
            _tag: "Success",
            success: { _tag: "Right", right: { root: "missing", elements: {} } },
            recordedAt,
          },
          error: { code: "generated-spec-invalid", retryable: true },
        },
      ] as const;
      for (const { outcome, error } of cases) {
        const failed = yield* generateBrickSpecExternalV1.evaluate({
          aggregateId: "acct_harness",
          claims: null,
          payload: external.payload,
          db,
          externalOutcome: outcome,
        });
        expect(failed.operations).toHaveLength(1);
        expect(failed.operations[0]).toMatchObject({
          operationName: "update",
          resourceId: placementId,
          body: { attributes: { generation: { status: "failed", error } } },
        });
      }
    }),
);
