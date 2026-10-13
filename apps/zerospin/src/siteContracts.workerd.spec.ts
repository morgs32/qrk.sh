import { userActorV1 } from "./aggregates/user/actors/userActorV1";
import { makeAggregateSessionRelease } from "@zerospin/core/sessionRelease/makeAggregateSessionRelease";
import { validatePayload } from "@zerospin/core/contracts/validatePayload";
import { prefixId } from "@zerospin/sdk/browser";
import { it } from "@effect/vitest";
import SQLiteFactory from "@livestore/wa-sqlite/dist/wa-sqlite.mjs";
import wasm from "@livestore/wa-sqlite/dist/wa-sqlite.wasm";
import { makeResourceDbConfig } from "@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig";
import { makeProvisionedInMemorySqljsDb } from "@zerospin/core/drizzle/make/makeProvisionedInMemorySqljsDb/makeProvisionedInMemorySqljsDb";
import { makeInMemorySQLite3 } from "@zerospin/core/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3";
import { makeSqliteDrizzle } from "@zerospin/core/drizzle/make/makeSqliteDrizzle";
import { provisionDb } from "@zerospin/core/drizzle/provisionDb/provisionDb";
import { makeInitializedAggregateSession } from "@zerospin/core/aggregateSession/makeInitializedAggregateSession";
import {
  GENESIS_EXECUTED_PREIMAGE,
  hashDisposition,
} from "@zerospin/core/contracts/dispositionHash";
import { makeAggregateSession } from "@zerospin/core/aggregateSession/make/makeAggregateSession";
import { sessionRepoDbConfig } from "@zerospin/core/aggregateSession/sessionRepoDbConfig";
import { stageAggregateSessionCommand } from "@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand";
import { makeContractReadDb } from "@zerospin/core/contracts/make/makeContractReadDb";
import { SessionFailures } from "@zerospin/core/sessionFailures/SessionFailures";
import type { CuidFactory } from "@zerospin/shapes";
import type { MonotonicFactory } from "@zerospin/core/services/MonotonicFactory";
import { TelemetryCollector } from "@zerospin/logger";
import { NanoIdFactory } from "@zerospin/core/utils/NanoIdFactory";
import { UlidMonotonicFactory } from "@zerospin/core/utils/UlidMonotonicFactory";
import { DateTime, Effect, Layer, ManagedRuntime, Result } from "effect";
import { describe, expect } from "vitest";

import { createPageV1 as createPage } from "./aggregates/user/contracts/createPage/CreatePageV1";
import { createSiteV1 as createSite } from "./aggregates/user/contracts/createSite/CreateSiteV1";
import { libraryModule } from "@qrk.sh/library/libraryModule";
import { siteV1 as Site } from "./aggregates/user/models/site/SiteV1";
import { userV1 as User } from "./aggregates/user/models/user/UserV1";
import { userSessionDefinition } from "./aggregates/user/userSessionDefinition";

describe("site and page creation contracts", () => {
  it.effect("stages a Site and its initial Page with caller-supplied IDs", () =>
    Effect.gen(function* () {
      const userId = "usr_independent_site_owner";
      const now = DateTime.toDateUtc(yield* DateTime.now);
      const dbConfig = makeResourceDbConfig({
        models: userSessionDefinition.models,
        otherTables: sessionRepoDbConfig.tables,
      });
      const client = yield* Effect.acquireRelease(
        Effect.promise(() =>
          makeInMemorySQLite3(() =>
            SQLiteFactory({
              instantiateWasm(
                imports: WebAssembly.Imports,
                receiveInstance: (instance: WebAssembly.Instance) => void,
              ) {
                const instance = new WebAssembly.Instance(wasm, imports);
                receiveInstance(instance);
                return instance.exports;
              },
            }),
          ),
        ),
        (client) => Effect.sync(() => client.sqlite3.close(client.db)),
      );
      const db = makeSqliteDrizzle(client, dbConfig);
      yield* provisionDb({ db, definition: dbConfig.definition });

      db.insert(dbConfig.schema.user)
        .values({
          id: userId,
          modelName: User.modelName,
          version: User.version,
          createdAt: now,
          updatedAt: now,
          clerkUserId: "site_contract_user",
          username: null,
          displayName: null,
        })
        .run();

      const sessionId = "sesn_site_contract";
      let runtime: ManagedRuntime.ManagedRuntime<
        CuidFactory | MonotonicFactory | SessionFailures | TelemetryCollector,
        never
      >;
      const definition = makeAggregateSessionRelease({
        ...userSessionDefinition,
        systemName: "qrk-sh",
      });
      if (definition.kind !== "aggregate") throw new Error("Expected aggregate session definition");
      const session = makeAggregateSession({
        sessionRelease: { ...definition, ...userSessionDefinition },
        execution: {
          runSync: (program) => runtime.runSync(program),
          runPromise: (program) => runtime.runPromise(program),
        },
      });
      runtime = yield* Effect.acquireRelease(
        Effect.sync(() =>
          ManagedRuntime.make(
            Layer.mergeAll(
              NanoIdFactory,
              UlidMonotonicFactory,
              Layer.succeed(SessionFailures, session.failures),
              Layer.succeed(TelemetryCollector, session.store.getState().telemetryCollector),
            ),
          ),
        ),
        (runtime) => runtime.disposeEffect,
      );
      const initialized = yield* makeInitializedAggregateSession({
        declaration: session.sessionRelease,
        db,
        admitted: {
          sessionId,
          aggregateId: "acct_site_contract_user",
          actorName: definition.actorName,
          actorVersion: definition.actorVersion,
          claims: {
            aggregateId: "acct_site_contract_user",
            clerkUserId: "site_contract_user",
          },
        },
      });
      session.store.setState({
        ...session.store.getState(),
        initialized,
        aggregateIndex: 0,
        dispositionHash: yield* Effect.promise(() => hashDisposition(GENESIS_EXECUTED_PREIMAGE)),
        pushIndex: 0,
      });

      const staged = stageAggregateSessionCommand({
        session,
        contractName: "createSite",
        payload: { id: "sit_site_contract", userId },
      });

      expect(staged._tag).toBe("Success");
      if (staged._tag === "Failure") {
        throw new Error(staged.failure.message);
      }

      const siteRows = db.select().from(dbConfig.schema.site).all();

      expect(staged.success.contractVersion).toBe("1.0.0");
      expect(staged.success.payload.id).toBe("sit_site_contract");
      expect(staged.success.payload.userId).toBe(userId);
      expect(staged.success.payload).toMatchObject({
        slug: null,
        name: null,
        description: null,
      });
      expect(siteRows).toHaveLength(1);
      expect(siteRows[0]).toEqual(
        expect.objectContaining({
          id: staged.success.payload.id,
          version: "1.0.0",
          userId,
          slug: null,
          name: null,
          description: null,
          logoUrl: null,
          faviconLightUrl: null,
          faviconDarkUrl: null,
        }),
      );

      // @ts-expect-error Caller-supplied IDs are required; also verify runtime rejection.
      const missingSiteId = stageAggregateSessionCommand({
        session,
        contractName: "createSite",
        payload: {},
      });
      expect(missingSiteId._tag).toBe("Failure");
      expect(db.select().from(dbConfig.schema.site).all()).toHaveLength(1);

      const siteId = staged.success.payload.id;
      const stagedPage = stageAggregateSessionCommand({
        session,
        contractName: "createPage",
        payload: {
          id: "pag_site_contract",
          siteId,
          slug: "home",
        },
      });

      expect(stagedPage._tag).toBe("Success");
      if (stagedPage._tag === "Failure") {
        throw new Error(stagedPage.failure.message);
      }

      const pageRows = db.select().from(dbConfig.schema.page).all();

      expect(stagedPage.success.contractVersion).toBe("1.0.0");
      expect(stagedPage.success.payload.id).toBe("pag_site_contract");
      expect(stagedPage.success.payload).toMatchObject({
        siteId,
        slug: "home",
        title: null,
        description: null,
      });
      expect(pageRows).toHaveLength(1);
      expect(pageRows[0]).toEqual(
        expect.objectContaining({
          id: stagedPage.success.payload.id,
          version: "1.0.0",
          siteId,
          slug: "home",
          title: null,
          description: null,
        }),
      );

      // @ts-expect-error Caller-supplied IDs are required; also verify runtime rejection.
      const missingPageId = stageAggregateSessionCommand({
        session,
        contractName: "createPage",
        payload: { siteId, slug: "missing-id" },
      });
      expect(missingPageId._tag).toBe("Failure");
      expect(db.select().from(dbConfig.schema.page).all()).toHaveLength(1);

      const wallId = prefixId(libraryModule.models.wall, stagedPage.success.payload.id);
      expect(pageRows[0]?.wallId).toBe(wallId);
      expect(db.select().from(dbConfig.schema.wall).all()).toMatchObject([{ id: wallId }]);

      const added = stageAggregateSessionCommand({
        session,
        contractName: "addBrick",
        payload: {
          wallId,
          brickId: "brk_live_first",
          moduleId: "swatch-and-icon",
          state: { payload: { hash: "" }, data: { name: "Test", svg: "<svg/>" } },
          spec: {
            root: "color",
            elements: {
              color: { type: "SwatchAndIconColor", props: { color: "#123456" }, children: [] },
            },
          },
          dropPosition: { x: 0, y: 0 },
          visibleLayouts: { sm: [], md: [], lg: [], xl: [] },
          placementSizes: {
            sm: { w: 2, h: 2 },
            md: { w: 2, h: 2 },
            lg: { w: 2, h: 2 },
            xl: { w: 2, h: 2 },
          },
        },
      });
      expect(added._tag).toBe("Success");
      if (added._tag === "Failure") throw new Error(added.failure.message);
      expect(db.query.brick.findMany().sync()).toMatchObject([{ id: "brk_live_first", wallId }]);
      expect(db.query.placement.findMany().sync()).toHaveLength(4);
      const updated = stageAggregateSessionCommand({
        session,
        contractName: "updateBrick",
        payload: {
          brickId: "brk_live_first",
          moduleId: "swatch-and-icon",
          state: { payload: { hash: "changed" }, data: { name: "Updated", svg: "<svg/>" } },
          measurements: null,
        },
      });
      expect(updated._tag).toBe("Success");
      expect(db.query.brick.findFirst().sync()?.state).toMatchObject({ data: { name: "Updated" } });
      const invalid = stageAggregateSessionCommand({
        session,
        contractName: "updateBrick",
        payload: {
          brickId: "brk_live_first",
          moduleId: "swatch-and-icon",
          state: { invalid: true },
          measurements: null,
        },
      });
      expect(invalid._tag).toBe("Failure");
      expect(db.query.brick.findFirst().sync()?.state).toMatchObject({ data: { name: "Updated" } });
      const secondPage = stageAggregateSessionCommand({
        session,
        contractName: "createPage",
        payload: { id: "pag_second", siteId, slug: "second" },
      });
      expect(secondPage._tag).toBe("Success");
      expect(db.query.page.findFirst({ where: { id: { eq: "pag_second" } } }).sync()?.wallId).toBe(
        "wal_pag_second",
      );
      expect(
        db.query.brick.findMany({ where: { wallId: { eq: "wal_pag_second" } } }).sync(),
      ).toEqual([]);

      // Mixed-owner rows exercise the actual actor selections, not a copied query.
      const owner = db.select().from(dbConfig.schema.user).get();
      const site = db.select().from(dbConfig.schema.site).get();
      const page = db.select().from(dbConfig.schema.page).get();
      const wall = db.select().from(dbConfig.schema.wall).get();
      const brick = db.select().from(dbConfig.schema.brick).get();
      if (!owner || !site || !page || !wall || !brick) throw new Error("Missing staged resources");
      db.insert(dbConfig.schema.user)
        .values({ ...owner, id: "usr_other", clerkUserId: "other" })
        .run();
      db.insert(dbConfig.schema.site)
        .values({ ...site, id: "sit_other", userId: "usr_other" })
        .run();
      db.insert(dbConfig.schema.wall)
        .values({ ...wall, id: "wal_other" })
        .run();
      db.insert(dbConfig.schema.page)
        .values({ ...page, id: "pag_other", siteId: "sit_other", wallId: "wal_other" })
        .run();
      db.insert(dbConfig.schema.brick)
        .values({ ...brick, id: "brk_other", wallId: "wal_other" })
        .run();
      for (const placement of db.select().from(dbConfig.schema.placement).all()) {
        db.insert(dbConfig.schema.placement)
          .values({
            ...placement,
            id: prefixId(libraryModule.models.placement, `other/${placement.breakpoint}`),
            brickId: "brk_other",
          })
          .run();
      }
      const selections = userActorV1.capturedSelections;
      const identity = { clerkUserId: "site_contract_user" };
      expect(selections.wall.all(db, identity)).toMatchObject([
        { id: wallId },
        { id: "wal_pag_second" },
      ]);
      expect(selections.brick.all(db, identity)).toMatchObject([{ id: "brk_live_first" }]);
      expect(selections.placement.all(db, identity)).toHaveLength(4);
      expect(selections.wall.all(db, { clerkUserId: "other" })).toMatchObject([
        { id: "wal_other" },
      ]);
      expect(selections.brick.all(db, { clerkUserId: "other" })).toMatchObject([
        { id: "brk_other" },
      ]);
      expect(selections.placement.all(db, { clerkUserId: "other" })).toHaveLength(4);
      expect(selections.wall.all(db, { clerkUserId: "missing" })).toEqual([]);
      expect(selections.brick.all(db, { clerkUserId: "missing" })).toEqual([]);
      expect(selections.placement.all(db, { clerkUserId: "missing" })).toEqual([]);

      // Visibility changes stay on one placement; removal deletes all of the brick's placements.
      const hidden = stageAggregateSessionCommand({
        session,
        contractName: "setBrickVisibilityAtBreakpoint",
        payload: {
          brickId: "brk_live_first",
          breakpoint: "lg",
          isVisible: false,
          currentlyVisible: true,
          savedGridItem: { i: "brk_live_first", x: 0, y: 0, w: 2, h: 2 },
          otherVisibleLayout: [],
        },
      });
      expect(hidden._tag).toBe("Success");
      expect(
        db.query.placement.findMany({ where: { brickId: { eq: "brk_live_first" } } }).sync(),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ breakpoint: "lg", isVisible: false }),
          expect.objectContaining({ breakpoint: "sm", isVisible: true }),
        ]),
      );
      const wrongWall = stageAggregateSessionCommand({
        session,
        contractName: "removeBrick",
        payload: { brickId: "brk_live_first", wallId: "wal_pag_second" },
      });
      expect(wrongWall._tag).toBe("Failure");
      const removed = stageAggregateSessionCommand({
        session,
        contractName: "removeBrick",
        payload: { brickId: "brk_live_first", wallId },
      });
      expect(removed._tag).toBe("Success");
      expect(selections.brick.all(db, identity)).toEqual([]);
      expect(selections.placement.all(db, identity)).toEqual([]);
      expect(selections.brick.all(db, { clerkUserId: "other" })).toHaveLength(1);
      expect(selections.placement.all(db, { clerkUserId: "other" })).toHaveLength(4);
    }).pipe(Effect.scoped),
  );

  it.effect("rejects site evaluation without an authenticated user", () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: userSessionDefinition.models });
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });
      const error = yield* createSite
        .evaluate({
          db: makeContractReadDb({ db, models: createSite.models }),
          aggregateId: "acct_site_program",
          claims: null,
          payload: {
            id: "sit_unauthenticated",
            userId: "usr_independent_site_owner",
            slug: null,
            name: null,
            description: null,
          },
        })
        .pipe(Effect.flip);

      expect(error).toMatchObject({
        code: "create-site-user-mismatch",
        status: 403,
      });
    }).pipe(Effect.scoped),
  );

  it.effect("rejects a site payload without userId", () =>
    Effect.gen(function* () {
      const validation = yield* validatePayload(createSite, {
        version: "1.0.0",
        // @ts-expect-error Intentionally omit the required owner ID to exercise runtime validation.
        payload: {
          id: "sit_missing_user",
        },
      }).pipe(Effect.result);

      expect(Result.isFailure(validation)).toBe(true);
    }).pipe(Effect.scoped),
  );

  it.effect("rejects a Page payload that omits siteId", () =>
    Effect.gen(function* () {
      const validation = yield* validatePayload(createPage, {
        version: "1.0.0",
        // @ts-expect-error Intentionally omit the required parent ID to exercise runtime validation.
        payload: {
          id: "pag_missing_site",
          slug: "home",
        },
      }).pipe(Effect.result);

      expect(Result.isFailure(validation)).toBe(true);
    }).pipe(Effect.scoped),
  );
});

describe("user frontend creation guards", () => {
  it.effect("rejects a User that does not belong to the authenticated user", () =>
    Effect.gen(function* () {
      const userId = "usr_independent_guard_owner";
      const now = DateTime.toDateUtc(yield* DateTime.now);
      const dbConfig = makeResourceDbConfig({
        models: userSessionDefinition.models,
      });
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });

      db.insert(dbConfig.schema.user)
        .values({
          id: userId,
          modelName: User.modelName,
          version: User.version,
          createdAt: now,
          updatedAt: now,
          clerkUserId: "site_guard_user",
          username: null,
          displayName: null,
        })
        .run();

      yield* createSite.evaluate({
        aggregateId: "acct_guard_user",
        claims: { clerkUserId: "site_guard_user" },
        db: makeContractReadDb({ db, models: createSite.models }),
        payload: {
          id: "sit_site_guard_user",
          userId,
          slug: null,
          name: null,
          description: null,
        },
      });

      for (const authenticatedIdentityKey of ["different_site_user", null]) {
        const error = yield* createSite
          .evaluate({
            aggregateId: "acct_guard_user",
            claims: { clerkUserId: authenticatedIdentityKey },
            db: makeContractReadDb({ db, models: createSite.models }),
            payload: {
              id: "sit_site_guard_user",
              userId,
              slug: null,
              name: null,
              description: null,
            },
          })
          .pipe(Effect.flip);

        expect(error).toMatchObject({
          code: "create-site-user-mismatch",
          status: 403,
        });
      }
    }).pipe(Effect.scoped),
  );

  it.effect("rejects a Page whose Site does not belong to the authenticated user", () =>
    Effect.gen(function* () {
      const userId = "usr_page_guard_user";
      const siteId = "sit_page_guard_user";
      const now = DateTime.toDateUtc(yield* DateTime.now);
      const dbConfig = makeResourceDbConfig({
        models: userSessionDefinition.models,
      });
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });

      db.insert(dbConfig.schema.user)
        .values({
          id: userId,
          modelName: User.modelName,
          version: User.version,
          createdAt: now,
          updatedAt: now,
          clerkUserId: "page_guard_user",
          username: null,
          displayName: null,
        })
        .run();

      db.insert(dbConfig.schema.site)
        .values({
          id: siteId,
          modelName: Site.modelName,
          version: Site.version,
          createdAt: now,
          updatedAt: now,
          userId,
          slug: null,
          name: null,
          description: null,
          logoUrl: null,
          faviconLightUrl: null,
          faviconDarkUrl: null,
        })
        .run();

      yield* createPage.evaluate({
        aggregateId: "acct_guard_user",
        claims: { clerkUserId: "page_guard_user" },
        db: makeContractReadDb({ db, models: createPage.models }),
        payload: {
          id: "pag_page_guard_user",
          siteId,
          slug: "home",
          title: null,
          description: null,
        },
      });

      for (const authenticatedIdentityKey of ["different_page_user", null]) {
        const error = yield* createPage
          .evaluate({
            aggregateId: "acct_guard_user",
            claims: { clerkUserId: authenticatedIdentityKey },
            db: makeContractReadDb({ db, models: createPage.models }),
            payload: {
              id: "pag_page_guard_user",
              siteId,
              slug: "home",
              title: null,
              description: null,
            },
          })
          .pipe(Effect.flip);

        expect(error).toMatchObject({
          code: "create-page-user-mismatch",
          status: 403,
        });
      }
    }).pipe(Effect.scoped),
  );

  it.effect("updates site settings for the owning authenticated user", () =>
    Effect.gen(function* () {
      const userId = "usr_update_site_settings";
      const now = DateTime.toDateUtc(yield* DateTime.now);
      const dbConfig = makeResourceDbConfig({
        models: userSessionDefinition.models,
        otherTables: sessionRepoDbConfig.tables,
      });
      const client = yield* Effect.acquireRelease(
        Effect.promise(() =>
          makeInMemorySQLite3(() =>
            SQLiteFactory({
              instantiateWasm(
                imports: WebAssembly.Imports,
                receiveInstance: (instance: WebAssembly.Instance) => void,
              ) {
                const instance = new WebAssembly.Instance(wasm, imports);
                receiveInstance(instance);
                return instance.exports;
              },
            }),
          ),
        ),
        (client) => Effect.sync(() => client.sqlite3.close(client.db)),
      );
      const db = makeSqliteDrizzle(client, dbConfig);
      yield* provisionDb({ db, definition: dbConfig.definition });

      db.insert(dbConfig.schema.user)
        .values({
          id: userId,
          modelName: User.modelName,
          version: User.version,
          createdAt: now,
          updatedAt: now,
          clerkUserId: "update_site_settings_user",
          username: null,
          displayName: null,
        })
        .run();

      const sessionId = "sesn_update_site_settings";
      let runtime: ManagedRuntime.ManagedRuntime<
        CuidFactory | MonotonicFactory | SessionFailures | TelemetryCollector,
        never
      >;
      const definition = makeAggregateSessionRelease({
        ...userSessionDefinition,
        systemName: "qrk-sh",
      });
      if (definition.kind !== "aggregate") throw new Error("Expected aggregate session definition");
      const session = makeAggregateSession({
        sessionRelease: { ...definition, ...userSessionDefinition },
        execution: {
          runSync: (program) => runtime.runSync(program),
          runPromise: (program) => runtime.runPromise(program),
        },
      });
      runtime = yield* Effect.acquireRelease(
        Effect.sync(() =>
          ManagedRuntime.make(
            Layer.mergeAll(
              NanoIdFactory,
              UlidMonotonicFactory,
              Layer.succeed(SessionFailures, session.failures),
              Layer.succeed(TelemetryCollector, session.store.getState().telemetryCollector),
            ),
          ),
        ),
        (runtime) => runtime.disposeEffect,
      );
      const initialized = yield* makeInitializedAggregateSession({
        declaration: session.sessionRelease,
        db,
        admitted: {
          sessionId,
          aggregateId: "acct_update_site_settings_user",
          actorName: definition.actorName,
          actorVersion: definition.actorVersion,
          claims: {
            aggregateId: "acct_update_site_settings_user",
            clerkUserId: "update_site_settings_user",
          },
        },
      });
      session.store.setState({
        ...session.store.getState(),
        initialized,
        aggregateIndex: 0,
        dispositionHash: yield* Effect.promise(() => hashDisposition(GENESIS_EXECUTED_PREIMAGE)),
        pushIndex: 0,
      });

      const staged = stageAggregateSessionCommand({
        session,
        contractName: "createSite",
        payload: { id: "sit_update_site_settings", userId },
      });
      expect(staged._tag).toBe("Success");
      if (staged._tag === "Failure") {
        throw new Error(staged.failure.message);
      }

      const updated = stageAggregateSessionCommand({
        session,
        contractName: "updateSiteSettings",
        payload: {
          id: staged.success.payload.id,
          name: "Rainey",
          description: "A site",
          logoUrl: "https://pub.test.r2.dev/logo.png",
          faviconLightUrl: "https://pub.test.r2.dev/favicon-light.png",
          faviconDarkUrl: "https://pub.test.r2.dev/favicon-dark.png",
        },
      });
      expect(updated._tag).toBe("Success");
      if (updated._tag === "Failure") {
        throw new Error(updated.failure.message);
      }

      expect(updated.success.contractVersion).toBe("1.0.0");
      expect(updated.success.payload).toMatchObject({
        id: staged.success.payload.id,
        name: "Rainey",
        description: "A site",
        logoUrl: "https://pub.test.r2.dev/logo.png",
        faviconLightUrl: "https://pub.test.r2.dev/favicon-light.png",
        faviconDarkUrl: "https://pub.test.r2.dev/favicon-dark.png",
      });

      const siteRows = db.select().from(dbConfig.schema.site).all();
      expect(siteRows).toHaveLength(1);
      expect(siteRows[0]).toEqual(
        expect.objectContaining({
          id: staged.success.payload.id,
          name: "Rainey",
          description: "A site",
          logoUrl: "https://pub.test.r2.dev/logo.png",
          faviconLightUrl: "https://pub.test.r2.dev/favicon-light.png",
          faviconDarkUrl: "https://pub.test.r2.dev/favicon-dark.png",
        }),
      );
    }).pipe(Effect.scoped),
  );

  it.effect("updates page settings for the owning authenticated user", () =>
    Effect.gen(function* () {
      const userId = "usr_update_page_settings";
      const now = DateTime.toDateUtc(yield* DateTime.now);
      const dbConfig = makeResourceDbConfig({
        models: userSessionDefinition.models,
        otherTables: sessionRepoDbConfig.tables,
      });
      const client = yield* Effect.acquireRelease(
        Effect.promise(() =>
          makeInMemorySQLite3(() =>
            SQLiteFactory({
              instantiateWasm(
                imports: WebAssembly.Imports,
                receiveInstance: (instance: WebAssembly.Instance) => void,
              ) {
                const instance = new WebAssembly.Instance(wasm, imports);
                receiveInstance(instance);
                return instance.exports;
              },
            }),
          ),
        ),
        (client) => Effect.sync(() => client.sqlite3.close(client.db)),
      );
      const db = makeSqliteDrizzle(client, dbConfig);
      yield* provisionDb({ db, definition: dbConfig.definition });

      db.insert(dbConfig.schema.user)
        .values({
          id: userId,
          modelName: User.modelName,
          version: User.version,
          createdAt: now,
          updatedAt: now,
          clerkUserId: "update_page_settings_user",
          username: null,
          displayName: null,
        })
        .run();

      const sessionId = "sesn_update_page_settings";
      let runtime: ManagedRuntime.ManagedRuntime<
        CuidFactory | MonotonicFactory | SessionFailures | TelemetryCollector,
        never
      >;
      const definition = makeAggregateSessionRelease({
        ...userSessionDefinition,
        systemName: "qrk-sh",
      });
      if (definition.kind !== "aggregate") throw new Error("Expected aggregate session definition");
      const session = makeAggregateSession({
        sessionRelease: { ...definition, ...userSessionDefinition },
        execution: {
          runSync: (program) => runtime.runSync(program),
          runPromise: (program) => runtime.runPromise(program),
        },
      });
      runtime = yield* Effect.acquireRelease(
        Effect.sync(() =>
          ManagedRuntime.make(
            Layer.mergeAll(
              NanoIdFactory,
              UlidMonotonicFactory,
              Layer.succeed(SessionFailures, session.failures),
              Layer.succeed(TelemetryCollector, session.store.getState().telemetryCollector),
            ),
          ),
        ),
        (runtime) => runtime.disposeEffect,
      );
      const initialized = yield* makeInitializedAggregateSession({
        declaration: session.sessionRelease,
        db,
        admitted: {
          sessionId,
          aggregateId: "acct_update_page_settings_user",
          actorName: definition.actorName,
          actorVersion: definition.actorVersion,
          claims: {
            aggregateId: "acct_update_page_settings_user",
            clerkUserId: "update_page_settings_user",
          },
        },
      });
      session.store.setState({
        ...session.store.getState(),
        initialized,
        aggregateIndex: 0,
        dispositionHash: yield* Effect.promise(() => hashDisposition(GENESIS_EXECUTED_PREIMAGE)),
        pushIndex: 0,
      });

      const stagedSite = stageAggregateSessionCommand({
        session,
        contractName: "createSite",
        payload: { id: "sit_update_page_settings", userId },
      });
      expect(stagedSite._tag).toBe("Success");
      if (stagedSite._tag === "Failure") {
        throw new Error(stagedSite.failure.message);
      }

      const stagedPage = stageAggregateSessionCommand({
        session,
        contractName: "createPage",
        payload: {
          id: "pag_update_page_settings",
          siteId: stagedSite.success.payload.id,
          slug: "home",
        },
      });
      expect(stagedPage._tag).toBe("Success");
      if (stagedPage._tag === "Failure") {
        throw new Error(stagedPage.failure.message);
      }

      const ownerState = session.store.getState();
      if (ownerState.initialized === null)
        throw new Error("Expected initialized page settings session");
      session.store.setState({
        ...ownerState,
        initialized: yield* makeInitializedAggregateSession({
          declaration: session.sessionRelease,
          db,
          admitted: {
            sessionId: "sesn_foreign_page_settings",
            aggregateId: ownerState.initialized.aggregateId,
            actorName: session.sessionRelease.actorName,
            actorVersion: session.sessionRelease.actorVersion,
            claims: {
              aggregateId: "acct_update_page_settings_user",
              clerkUserId: "another_user",
            },
          },
        }),
      });
      const denied = stageAggregateSessionCommand({
        session,
        contractName: "updatePageSettings",
        payload: {
          id: stagedPage.success.payload.id,
          title: "Denied",
          description: null,
        },
      });
      expect(denied._tag).toBe("Failure");
      session.store.setState(ownerState);

      const updated = stageAggregateSessionCommand({
        session,
        contractName: "updatePageSettings",
        payload: {
          id: stagedPage.success.payload.id,
          title: "Hello page",
          description: "A page description",
        },
      });
      expect(updated._tag).toBe("Success");
      if (updated._tag === "Failure") {
        throw new Error(updated.failure.message);
      }

      expect(updated.success.contractVersion).toBe("1.0.0");
      expect(updated.success.payload).toMatchObject({
        id: stagedPage.success.payload.id,
        title: "Hello page",
        description: "A page description",
      });

      const pageRows = db.select().from(dbConfig.schema.page).all();
      expect(pageRows).toHaveLength(1);
      expect(pageRows[0]).toEqual(
        expect.objectContaining({
          id: stagedPage.success.payload.id,
          title: "Hello page",
          description: "A page description",
        }),
      );
    }).pipe(Effect.scoped),
  );
});
