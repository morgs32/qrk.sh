import { validatePayload } from "@zerospin/core/contracts/validatePayload";
import { initializeGuards } from "@zerospin/core/frontendController/initializeGuards";
import { prefixId } from "@zerospin/sdk/browser";
import { it } from "@effect/vitest";
import { AsyncLive } from "@zerospin/core/async/AsyncLive";
import { makeResourceDbConfig } from "@zerospin/core/drizzle/makeDbConfig";
import { makeProvisionedInMemoryWasmSqliteDb } from "@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb";
import { makeAggregateSession } from "@zerospin/core/session/makeAggregateSession";
import { sessionRepoTables } from "@zerospin/core/session/sessionRepoTables";
import { NanoIdFactory } from "@zerospin/core/utils/NanoIdFactory";
import { UlidMonotonicFactory } from "@zerospin/core/utils/UlidMonotonicFactory";
import { DateTime, Effect, Layer, ManagedRuntime, Result } from "effect";
import { describe, expect } from "vitest";

import { createPageV2 as createPage } from "./aggregates/user/contracts/createPage/CreatePageV2";
import { createSiteV2 as createSite } from "./aggregates/user/contracts/createSite/CreateSiteV2";
import { gridV1 as Grid } from "./aggregates/user/models/grid/GridV1";
import { brickV2 as Brick } from "./aggregates/user/models/brick/BrickV2";
import { siteV2 as Site } from "./aggregates/user/models/site/SiteV2";
import { userV1 as User } from "./aggregates/user/models/user/UserV1";
import { userFrontend } from "./aggregates/user/userFrontend";

describe("site and page creation contracts", () => {
  it.effect("stages a Site and its initial Page with caller-supplied IDs", () =>
    Effect.gen(function* () {
      const userId = "usr_independent_site_owner";
      const now = DateTime.toDateUtc(yield* DateTime.now);
      const dbConfig = makeResourceDbConfig({
        models: userFrontend.models,
        otherTables: sessionRepoTables,
      });
      const { schema } = dbConfig;
      const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      );

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
      const runtime = yield* Effect.acquireRelease(
        Effect.sync(() => ManagedRuntime.make(Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory))),
        (runtime) => runtime.disposeEffect,
      );
      const guards = yield* initializeGuards(userFrontend);
      const session = makeAggregateSession({
        runtime,
        guards,
        frontend: userFrontend,
        sessionId,
      });
      session.store.setState({
        ...session.store.getState(),
        sessionId,
        aggregateId: "acct_site_contract_user",
        aggregateName: userFrontend.aggregateName,
        authentication: {
          aggregateId: "acct_site_contract_user",
          clerkUserId: "site_contract_user",
        },
        systemId: "sys_site_contract",
        frontendName: userFrontend.name,
        aggregateFrontendLockKey: "site-contract-lock-key",
        db,
        schema,
        models: userFrontend.models,
        isInitialized: true,
        aggregateIndex: 0,
        userIndex: 0,
        pushIndex: 0,
        sessionStatus: "current",
        backupState: { status: "ready", failure: null },
      });

      const staged = session.executeCommand({
        contractName: "createSite",
        payload: { id: "sit_site_contract", userId },
      });

      expect(staged._tag).toBe("Success");
      if (staged._tag === "Failure") {
        throw new Error(staged.failure.message);
      }

      const siteRows = db.select().from(dbConfig.schema.site).all();

      expect(staged.success.contractVersion).toBe("2.0.0");
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
          version: "2.0.0",
          userId,
          slug: null,
          name: null,
          description: null,
          logoUrl: null,
          faviconLightUrl: null,
          faviconDarkUrl: null,
        }),
      );

      const missingSiteId = session.executeCommand({
        contractName: "createSite",
        // @ts-expect-error Caller-supplied IDs are required; also verify runtime rejection.
        payload: {},
      });
      expect(missingSiteId._tag).toBe("Failure");
      expect(db.select().from(dbConfig.schema.site).all()).toHaveLength(1);

      const siteId = staged.success.payload.id;
      const stagedPage = session.executeCommand({
        contractName: "createPage",
        payload: {
          id: "pag_site_contract",
          siteId,
          slug: "home",
          pageType: "split-scroll",
        },
      });

      expect(stagedPage._tag).toBe("Success");
      if (stagedPage._tag === "Failure") {
        throw new Error(stagedPage.failure.message);
      }

      const pageRows = db.select().from(dbConfig.schema.page).all();

      expect(stagedPage.success.contractVersion).toBe("2.0.0");
      expect(stagedPage.success.payload.id).toBe("pag_site_contract");
      expect(stagedPage.success.payload).toMatchObject({
        siteId,
        slug: "home",
        title: null,
        description: null,
        pageType: "split-scroll",
        article: null,
      });
      expect(pageRows).toHaveLength(1);
      expect(pageRows[0]).toEqual(
        expect.objectContaining({
          id: stagedPage.success.payload.id,
          version: "2.0.0",
          siteId,
          slug: "home",
          title: null,
          description: null,
          pageType: "split-scroll",
          article: null,
        }),
      );

      const missingPageId = session.executeCommand({
        contractName: "createPage",
        // @ts-expect-error Caller-supplied IDs are required; also verify runtime rejection.
        payload: { siteId, slug: "missing-id", pageType: "split-scroll" },
      });
      expect(missingPageId._tag).toBe("Failure");
      expect(db.select().from(dbConfig.schema.page).all()).toHaveLength(1);

      const gridId = prefixId(Grid, `${stagedPage.success.payload.id}/main`);
      const brickId = prefixId(Brick, `${gridId}/first`);
      const grid = session.executeCommand({
        contractName: "createGrid",
        payload: {
          id: gridId,
          pageId: stagedPage.success.payload.id,
          name: "Home grid",
          columnCount: 8,
          bricks: [
            {
              id: brickId,
              brickKey: "first",
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              groupId: "text-brick",
              catalogId: "default",
              viewId: "4x4",
            },
          ],
        },
      });
      expect(grid._tag).toBe("Success");
      const originalGrid = db.select().from(dbConfig.schema.grid).all();
      const originalBricks = db.select().from(dbConfig.schema.brick).all();
      const invalidUpdate = session.executeCommand({
        contractName: "updateGrid",
        payload: {
          id: gridId,
          name: "Must not be saved",
          columnCount: 12,
          gridIntent: "update",
          expectedRevision: 0,
          bricks: [],
          deletedBrickIds: [],
        },
      });
      expect(invalidUpdate).toMatchObject({
        _tag: "Failure",
        failure: { code: "update-grid-incomplete-snapshot" },
      });
      expect(db.select().from(dbConfig.schema.grid).all()).toEqual(originalGrid);
      expect(db.select().from(dbConfig.schema.brick).all()).toEqual(originalBricks);

      const updated = session.executeCommand({
        contractName: "updateGrid",
        payload: {
          id: gridId,
          name: "Home grid",
          columnCount: 8,
          gridIntent: "none",
          expectedRevision: 0,
          bricks: [
            {
              intent: "update",
              id: brickId,
              brickKey: "first",
              x: 4,
              y: 0,
              w: 4,
              h: 4,
              groupId: "text-brick",
              catalogId: "default",
              viewId: "4x4",
            },
          ],
          deletedBrickIds: [],
        },
      });
      expect(updated._tag).toBe("Success");
      expect(db.select().from(dbConfig.schema.grid).all()[0]?.revision).toBe(1);
      expect(db.select().from(dbConfig.schema.brick).all()[0]?.x).toBe(4);
    }).pipe(Effect.scoped),
  );

  it.effect("rejects site program execution without an authenticated user", () =>
    Effect.gen(function* () {
      const error = yield* createSite
        .program({
          authentication: null,
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
    }),
  );

  it.effect("rejects a site payload without userId", () =>
    Effect.gen(function* () {
      const validation = yield* validatePayload(createSite, {
        version: "2.0.0",
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
        version: "2.0.0",
        // @ts-expect-error Intentionally omit the required parent ID to exercise runtime validation.
        payload: {
          id: "pag_missing_site",
          slug: "home",
          pageType: "split-scroll",
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
        models: userFrontend.models,
      });
      const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      );

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

      const guard = createSite.guard;
      if (guard === undefined) {
        throw new Error("Expected userFrontend createSite guard");
      }

      yield* guard({
        authentication: { clerkUserId: "site_guard_user" },
        db,
        payload: {
          id: "sit_site_guard_user",
          userId,
          slug: null,
          name: null,
          description: null,
        },
      });

      for (const authenticatedIdentityKey of ["different_site_user", null]) {
        const error = yield* guard({
          authentication: { clerkUserId: authenticatedIdentityKey },
          db,
          payload: {
            id: "sit_site_guard_user",
            userId,
            slug: null,
            name: null,
            description: null,
          },
        }).pipe(Effect.flip);

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
        models: userFrontend.models,
      });
      const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      );

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

      const guard = createPage.guard;
      if (guard === undefined) {
        throw new Error("Expected userFrontend createPage guard");
      }

      yield* guard({
        authentication: { clerkUserId: "page_guard_user" },
        db,
        payload: {
          id: "pag_page_guard_user",
          siteId,
          slug: "home",
          title: null,
          description: null,
          pageType: "split-scroll",
          article: null,
        },
      });

      for (const authenticatedIdentityKey of ["different_page_user", null]) {
        const error = yield* guard({
          authentication: { clerkUserId: authenticatedIdentityKey },
          db,
          payload: {
            id: "pag_page_guard_user",
            siteId,
            slug: "home",
            title: null,
            description: null,
            pageType: "split-scroll",
            article: null,
          },
        }).pipe(Effect.flip);

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
        models: userFrontend.models,
        otherTables: sessionRepoTables,
      });
      const { schema } = dbConfig;
      const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      );

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
      const runtime = yield* Effect.acquireRelease(
        Effect.sync(() => ManagedRuntime.make(Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory))),
        (runtime) => runtime.disposeEffect,
      );
      const guards = yield* initializeGuards(userFrontend);
      const session = makeAggregateSession({
        runtime,
        guards,
        frontend: userFrontend,
        sessionId,
      });
      session.store.setState({
        ...session.store.getState(),
        sessionId,
        aggregateId: "acct_update_site_settings_user",
        aggregateName: userFrontend.aggregateName,
        authentication: {
          aggregateId: "acct_update_site_settings_user",
          clerkUserId: "update_site_settings_user",
        },
        systemId: "sys_update_site_settings",
        frontendName: userFrontend.name,
        aggregateFrontendLockKey: "update-site-settings-lock-key",
        db,
        schema,
        models: userFrontend.models,
        isInitialized: true,
        aggregateIndex: 0,
        userIndex: 0,
        pushIndex: 0,
        sessionStatus: "current",
        backupState: { status: "ready", failure: null },
      });

      const staged = session.executeCommand({
        contractName: "createSite",
        payload: { id: "sit_update_site_settings", userId },
      });
      expect(staged._tag).toBe("Success");
      if (staged._tag === "Failure") {
        throw new Error(staged.failure.message);
      }

      const updated = session.executeCommand({
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
        models: userFrontend.models,
        otherTables: sessionRepoTables,
      });
      const { schema } = dbConfig;
      const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      );

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
      const runtime = yield* Effect.acquireRelease(
        Effect.sync(() => ManagedRuntime.make(Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory))),
        (runtime) => runtime.disposeEffect,
      );
      const guards = yield* initializeGuards(userFrontend);
      const session = makeAggregateSession({
        runtime,
        guards,
        frontend: userFrontend,
        sessionId,
      });
      session.store.setState({
        ...session.store.getState(),
        sessionId,
        aggregateId: "acct_update_page_settings_user",
        aggregateName: userFrontend.aggregateName,
        authentication: {
          aggregateId: "acct_update_page_settings_user",
          clerkUserId: "update_page_settings_user",
        },
        systemId: "sys_update_page_settings",
        frontendName: userFrontend.name,
        aggregateFrontendLockKey: "update-page-settings-lock-key",
        db,
        schema,
        models: userFrontend.models,
        isInitialized: true,
        aggregateIndex: 0,
        userIndex: 0,
        pushIndex: 0,
        sessionStatus: "current",
        backupState: { status: "ready", failure: null },
      });

      const stagedSite = session.executeCommand({
        contractName: "createSite",
        payload: { id: "sit_update_page_settings", userId },
      });
      expect(stagedSite._tag).toBe("Success");
      if (stagedSite._tag === "Failure") {
        throw new Error(stagedSite.failure.message);
      }

      const stagedPage = session.executeCommand({
        contractName: "createPage",
        payload: {
          id: "pag_update_page_settings",
          siteId: stagedSite.success.payload.id,
          slug: "home",
          pageType: "split-scroll",
        },
      });
      expect(stagedPage._tag).toBe("Success");
      if (stagedPage._tag === "Failure") {
        throw new Error(stagedPage.failure.message);
      }

      const updated = session.executeCommand({
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

  it.effect("updates page article for the owning authenticated user", () =>
    Effect.gen(function* () {
      const userId = "usr_update_page_article";
      const now = DateTime.toDateUtc(yield* DateTime.now);
      const dbConfig = makeResourceDbConfig({
        models: userFrontend.models,
        otherTables: sessionRepoTables,
      });
      const { schema } = dbConfig;
      const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      );

      db.insert(dbConfig.schema.user)
        .values({
          id: userId,
          modelName: User.modelName,
          version: User.version,
          createdAt: now,
          updatedAt: now,
          clerkUserId: "update_page_article_user",
          username: null,
          displayName: null,
        })
        .run();

      const sessionId = "sesn_update_page_article";
      const runtime = yield* Effect.acquireRelease(
        Effect.sync(() => ManagedRuntime.make(Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory))),
        (runtime) => runtime.disposeEffect,
      );
      const guards = yield* initializeGuards(userFrontend);
      const session = makeAggregateSession({
        runtime,
        guards,
        frontend: userFrontend,
        sessionId,
      });
      session.store.setState({
        ...session.store.getState(),
        sessionId,
        aggregateId: "acct_update_page_article_user",
        aggregateName: userFrontend.aggregateName,
        authentication: {
          aggregateId: "acct_update_page_article_user",
          clerkUserId: "update_page_article_user",
        },
        systemId: "sys_update_page_article",
        frontendName: userFrontend.name,
        aggregateFrontendLockKey: "update-page-article-lock-key",
        db,
        schema,
        models: userFrontend.models,
        isInitialized: true,
        aggregateIndex: 0,
        userIndex: 0,
        pushIndex: 0,
        sessionStatus: "current",
        backupState: { status: "ready", failure: null },
      });

      const stagedSite = session.executeCommand({
        contractName: "createSite",
        payload: { id: "sit_update_page_article", userId },
      });
      expect(stagedSite._tag).toBe("Success");
      if (stagedSite._tag === "Failure") {
        throw new Error(stagedSite.failure.message);
      }

      const stagedPage = session.executeCommand({
        contractName: "createPage",
        payload: {
          id: "pag_update_page_article",
          siteId: stagedSite.success.payload.id,
          slug: "home",
          pageType: "split-scroll",
        },
      });
      expect(stagedPage._tag).toBe("Success");
      if (stagedPage._tag === "Failure") {
        throw new Error(stagedPage.failure.message);
      }

      const article = {
        type: "doc" as const,
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "Hello" }],
          },
        ],
      };

      const updated = session.executeCommand({
        contractName: "updatePageArticle",
        payload: {
          id: stagedPage.success.payload.id,
          article,
        },
      });
      expect(updated._tag).toBe("Success");
      if (updated._tag === "Failure") {
        throw new Error(updated.failure.message);
      }

      expect(updated.success.contractVersion).toBe("1.0.0");
      expect(updated.success.payload).toMatchObject({
        id: stagedPage.success.payload.id,
        article,
      });

      const pageRows = db.select().from(dbConfig.schema.page).all();
      expect(pageRows).toHaveLength(1);
      expect(pageRows[0]).toEqual(
        expect.objectContaining({
          id: stagedPage.success.payload.id,
          article,
        }),
      );
    }).pipe(Effect.scoped),
  );
});
