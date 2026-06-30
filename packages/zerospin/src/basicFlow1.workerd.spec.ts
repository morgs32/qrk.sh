import { describe, it } from "@effect/vitest";
import { makeAccountCommand } from "@zerospin/core/accountController/makeAccountCommand";
import { AsyncLive } from "@zerospin/core/async/AsyncLive";
import { makeAsync } from "@zerospin/core/async/makeAsync";
import { PublishableKey } from "@zerospin/core/services/PublishableKey";
import { ZerospinApisUrl } from "@zerospin/core/services/ZerospinApisUrl";
import { IncrementalMonotonicFactory } from "@zerospin/core/test-utils/IncrementalMonotonicFactory";
import { makePrefixedIncrementalIdFactory } from "@zerospin/core/test-utils/makePrefixedIncrementalIdFactory";
import { TraceLoggerLayer } from "@zerospin/core/test-utils/TraceLoggerLayer";
import { decodeRpc } from "@zerospin/core/utils/decodeRpc";
import { ErrorLayer } from "@zerospin/core/utils/ErrorLayer";
import { makeAccountId } from "@zerospin/core/utils/makeAccountId";
import { makeActorId } from "@zerospin/core/utils/makeActorId";
import { executeInRepo } from "@zerospin/durables/test";
import { exports as workerExports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { Effect, Layer, Redacted } from "effect";
import type { SystemWorker } from "system-worker";
import { AccountDeltaFanout } from "system-worker/AccountDeltaFanout/AccountDeltaFanout";
import { ActorDeltaFanout } from "system-worker/ActorDeltaFanout/ActorDeltaFanout";
import { ActorRepo } from "system-worker/ActorRepo/ActorRepo";
import { FrontendRepo } from "system-worker/FrontendRepo/FrontendRepo";
import { managedRuntime } from "system-worker/managedRuntime";
import { SurfaceDeltaFanout } from "system-worker/SurfaceDeltaFanout/SurfaceDeltaFanout";
import { SurfaceRepo } from "system-worker/SurfaceRepo/SurfaceRepo";
import { expect, vi } from "vitest";

import { userAccount, system } from "./system";
import { Grid } from "./models/Grid";
import { GridItem } from "./models/GridItem";
import { Page } from "./models/Page";
import { Site } from "./models/Site";
import { User } from "./models/User";
import { ownerFrontend } from "./ownerFrontend";

/**
 * basicFlow1 — finalize the account commands needed to materialize one page.
 */

const actorName = "owner";
const DEPLOY_NAME = "qrk_basic_flow_1";
const E2E_ACCOUNT_ID = makeAccountId({ id: "1" });
const E2E_CLERK_USER_ID = "user_qrk_e2e_owner";
const E2E_ACTOR_ID = makeActorId({ id: E2E_CLERK_USER_ID });

const RPC_LOOPBACK_ORIGIN = "http://zerospin-test-rpc.invalid";

const systemWorker = workerExports.SystemWorker as unknown as SystemWorker;

vi.mock("cloudflare:workers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("cloudflare:workers")>();
  Object.assign(actual.env, {
    ADMIN_CLERK_SECRET_KEY: "sk_admin_test",
    ADMIN_CLERK_PUBLISHABLE_KEY: "pk_admin_test",
    CLOUD_CLERK_SECRET_KEY: "sk_cloud_test",
    CLOUD_CLERK_PUBLISHABLE_KEY: "pk_cloud_test",
    ZEROSPIN_ENVIRONMENT_ID: "zerospin-dev",
    DATABASE_URL: "postgres://localhost/test",
    CLOUDFLARE_ACCOUNT_ID: "account",
    CLOUDFLARE_API_TOKEN: "token",
    CLOUD_CLERK_JWKS_ENDPOINT: "https://example.com/jwks",
  });
  return actual;
});

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory("basicFlow1"),
  IncrementalMonotonicFactory,
  ErrorLayer,
  TraceLoggerLayer,
  AsyncLive,
  Layer.succeed(ZerospinApisUrl, `${RPC_LOOPBACK_ORIGIN}/`),
  Layer.succeed(PublishableKey, Redacted.make("pk_test")),
);

describe("basicFlow1: seed one qrk page through the system worker", () => {
  it.layer(TestLayer)(it => {
    it.effect(
      "finalizes user, site, page, grid, and grid item account commands",
      () =>
        /*
         * 1. Allocate deterministic resource ids for one user-owned page.
         * 2. Authorize the owner/web actor surface through SystemWorker.
         * 3. Build each account command explicitly.
         * 4. Finalize all commands in one authoritative account batch.
         * 5. Assert account rows and fanout propagation through actor/surface/frontend repos.
         */
        Effect.gen(function* () {
          // 1 — resource ids for the page graph.
          const userId = yield* User.makeId();
          const siteId = yield* Site.makeId();
          const pageId = yield* Page.makeId();
          const gridId = yield* Grid.makeId();
          const orangeFlagGridItemId = yield* GridItem.makeId();
          const textGridItemId = yield* GridItem.makeId();

          // 2 — make this actor/surface eligible for account delta delivery.
          yield* makeAsync(() =>
            systemWorker.authorize({
              accountId: E2E_ACCOUNT_ID,
              accountName: ownerFrontend.accountName,
              actorName,
              surfaceName: ownerFrontend.surfaceName,
              actor: { accountId: E2E_ACCOUNT_ID, actorId: E2E_ACTOR_ID },
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          // 3 — create the user row that authenticates the owner frontend signature.
          const createUserCommand = yield* makeAccountCommand({
            systemName: system.name,
            account: userAccount,
            contractName: "createUser",
            accountId: E2E_ACCOUNT_ID,
            accountName: ownerFrontend.accountName,
            payload: {
              id: userId,
              clerkUserId: E2E_CLERK_USER_ID,
              username: "qrk-e2e-owner",
              displayName: "QRK E2E Owner",
            },
          });

          // 3 — create the site shell.
          const createSiteCommand = yield* makeAccountCommand({
            systemName: system.name,
            account: userAccount,
            contractName: "createSite",
            accountId: E2E_ACCOUNT_ID,
            accountName: ownerFrontend.accountName,
            payload: {
              id: siteId,
              userId,
              slug: "e2e",
              name: "E2E Site",
              description: null,
            },
          });

          // 3 — create the home page under the site.
          const createPageCommand = yield* makeAccountCommand({
            systemName: system.name,
            account: userAccount,
            contractName: "createPage",
            accountId: E2E_ACCOUNT_ID,
            accountName: ownerFrontend.accountName,
            payload: {
              id: pageId,
              siteId,
              slug: "home",
              title: "Home",
              description: null,
              pageType: "split-scroll",
            },
          });

          // 3 — create the grid that holds placed bricks.
          const createGridCommand = yield* makeAccountCommand({
            systemName: system.name,
            account: userAccount,
            contractName: "createGrid",
            accountId: E2E_ACCOUNT_ID,
            accountName: ownerFrontend.accountName,
            payload: {
              id: gridId,
              pageId,
              name: "Home grid",
              columnCount: 8,
            },
          });

          // 3 — create the first placed catalog brick.
          const createOrangeFlagGridItemCommand = yield* makeAccountCommand({
            systemName: system.name,
            account: userAccount,
            contractName: "createGridItem",
            accountId: E2E_ACCOUNT_ID,
            accountName: ownerFrontend.accountName,
            payload: {
              id: orangeFlagGridItemId,
              gridId,
              itemKey: "orange-flag--0",
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              collectionName: "orange-flag",
              brickName: "4x4",
            },
          });

          // 3 — create the second placed catalog brick.
          const createTextGridItemCommand = yield* makeAccountCommand({
            systemName: system.name,
            account: userAccount,
            contractName: "createGridItem",
            accountId: E2E_ACCOUNT_ID,
            accountName: ownerFrontend.accountName,
            payload: {
              id: textGridItemId,
              gridId,
              itemKey: "text-brick-work--0",
              x: 0,
              y: 4,
              w: 8,
              h: 2,
              collectionName: "text-brick",
              brickName: "8x2",
            },
          });

          // 4 — finalize the full page graph in one authoritative batch.
          const finalization = yield* makeAsync(() =>
            systemWorker.finalizeAuthoritativeCommands({
              accountId: E2E_ACCOUNT_ID,
              accountName: ownerFrontend.accountName,
              commands: [
                createUserCommand,
                createSiteCommand,
                createPageCommand,
                createGridCommand,
                createOrangeFlagGridItemCommand,
                createTextGridItemCommand,
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(finalization.failedCommands).toEqual([]);
          expect(finalization.finalizedCommands).toHaveLength(6);
          expect(finalization.finalizedCommands).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: createUserCommand.id }),
              expect.objectContaining({ id: createSiteCommand.id }),
              expect.objectContaining({ id: createPageCommand.id }),
              expect.objectContaining({ id: createGridCommand.id }),
              expect.objectContaining({ id: createOrangeFlagGridItemCommand.id }),
              expect.objectContaining({ id: createTextGridItemCommand.id }),
            ]),
          );
          expect(finalization.event.cursor).toMatch(/^acdtcur_/);

          // 5 — account fanout persisted the finalized batch event.
          const accountFanoutRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              repo: AccountDeltaFanout,
              key: { accountId: E2E_ACCOUNT_ID },
              fn: ({ db, drizzleSchema }) =>
                db
                  .select({ cursor: drizzleSchema.events.cursor })
                  .from(drizzleSchema.events)
                  .where(eq(drizzleSchema.events.cursor, finalization.event.cursor))
                  .all(),
            }),
          );

          expect(accountFanoutRows).toEqual([
            { cursor: finalization.event.cursor },
          ]);

          // 5 — drain account fanout into the authorized actor repo.
          const accountDeltaFanout = AccountDeltaFanout.getRepo({
            key: { accountId: E2E_ACCOUNT_ID },
          });
          yield* makeAsync(() => accountDeltaFanout.start()).pipe(
            Effect.flatMap(decodeRpc),
          );

          const actorApplyHistoryRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              repo: ActorRepo,
              key: {
                accountId: E2E_ACCOUNT_ID,
                accountName: ownerFrontend.accountName,
                actorName,
                actorId: E2E_ACTOR_ID,
              },
              fn: ({ db, drizzleSchema }) => {
                const fanoutApplyHistory = drizzleSchema._fanoutApplyHistory;
                if (fanoutApplyHistory === undefined) {
                  throw new Error("expected _fanoutApplyHistory table");
                }

                const eventCursor = fanoutApplyHistory.eventCursor;
                if (eventCursor === undefined) {
                  throw new Error("expected _fanoutApplyHistory.eventCursor column");
                }

                return db
                  .select({
                    eventCursor,
                  })
                  .from(fanoutApplyHistory)
                  .where(eq(eventCursor, finalization.event.cursor))
                  .all();
              },
            }),
          );

          expect(actorApplyHistoryRows).toEqual([
            { eventCursor: finalization.event.cursor },
          ]);

          const actorDeltaFanout = ActorDeltaFanout.getRepo({
            key: {
              accountId: E2E_ACCOUNT_ID,
              actorId: E2E_ACTOR_ID,
              actorName,
            },
          });
          const actorDeltaCursor = yield* makeAsync(() =>
            actorDeltaFanout.getCurrentCursor(),
          ).pipe(Effect.flatMap(decodeRpc));
          if (actorDeltaCursor === null) {
            return yield* Effect.fail(
              new Error("expected actor delta cursor after account fanout"),
            );
          }
          yield* makeAsync(() => actorDeltaFanout.start()).pipe(
            Effect.flatMap(decodeRpc),
          );

          // 5 — frontend bootstrap authenticates with the user id and creates the surface repo path.
          const frontendState = yield* makeAsync(() =>
            systemWorker.getFrontendState({
              accountId: E2E_ACCOUNT_ID,
              accountName: ownerFrontend.accountName,
              actorId: E2E_ACTOR_ID,
              actorName,
              surfaceName: ownerFrontend.surfaceName,
              deployName: DEPLOY_NAME,
              signature: { userId },
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(frontendState).toMatchObject({
            accountName: ownerFrontend.accountName,
            actorId: E2E_ACTOR_ID,
            actorName,
            deployName: DEPLOY_NAME,
          });

          const surfaceApplyHistoryRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              repo: SurfaceRepo,
              key: {
                accountId: E2E_ACCOUNT_ID,
                accountName: ownerFrontend.accountName,
                actorName,
                actorId: E2E_ACTOR_ID,
                surfaceName: ownerFrontend.surfaceName,
              },
              fn: ({ db, drizzleSchema }) => {
                const fanoutApplyHistory = drizzleSchema._fanoutApplyHistory;
                if (fanoutApplyHistory === undefined) {
                  throw new Error("expected _fanoutApplyHistory table");
                }

                const eventCursor = fanoutApplyHistory.eventCursor;
                if (eventCursor === undefined) {
                  throw new Error("expected _fanoutApplyHistory.eventCursor column");
                }

                return db
                  .select({
                    eventCursor,
                  })
                  .from(fanoutApplyHistory)
                  .where(eq(eventCursor, actorDeltaCursor))
                  .all();
              },
            }),
          );

          expect(surfaceApplyHistoryRows).toEqual([
            { eventCursor: actorDeltaCursor },
          ]);

          const surfaceDeltaFanout = SurfaceDeltaFanout.getRepo({
            key: {
              accountId: E2E_ACCOUNT_ID,
              actorId: E2E_ACTOR_ID,
              actorName,
              surfaceName: ownerFrontend.surfaceName,
            },
          });
          const surfaceDeltaCursor = yield* makeAsync(() =>
            surfaceDeltaFanout.getCurrentCursor(),
          ).pipe(Effect.flatMap(decodeRpc));
          if (surfaceDeltaCursor === null) {
            return yield* Effect.fail(
              new Error("expected surface delta cursor after actor fanout"),
            );
          }
          yield* makeAsync(() => surfaceDeltaFanout.start()).pipe(
            Effect.flatMap(decodeRpc),
          );

          const frontendApplyHistoryRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              repo: FrontendRepo,
              key: {
                accountId: E2E_ACCOUNT_ID,
                accountName: ownerFrontend.accountName,
                actorName,
                actorId: E2E_ACTOR_ID,
                surfaceName: ownerFrontend.surfaceName,
              },
              fn: ({ db, drizzleSchema }) => {
                const fanoutApplyHistory = drizzleSchema._fanoutApplyHistory;
                if (fanoutApplyHistory === undefined) {
                  throw new Error("expected _fanoutApplyHistory table");
                }

                const eventCursor = fanoutApplyHistory.eventCursor;
                if (eventCursor === undefined) {
                  throw new Error("expected _fanoutApplyHistory.eventCursor column");
                }

                return db
                  .select({
                    eventCursor,
                  })
                  .from(fanoutApplyHistory)
                  .where(eq(eventCursor, surfaceDeltaCursor))
                  .all();
              },
            }),
          );

          expect(frontendApplyHistoryRows).toEqual([
            { eventCursor: surfaceDeltaCursor },
          ]);

          // 5 — account resources contain the two placed catalog bricks.
          const gridItemRows = yield* makeAsync(() =>
            systemWorker.getAccountResources({
              accountId: E2E_ACCOUNT_ID,
              accountName: ownerFrontend.accountName,
              modelName: "gridItem",
              limit: 10,
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(gridItemRows).toHaveLength(2);
          expect(gridItemRows).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: orangeFlagGridItemId,
                gridId,
                itemKey: "orange-flag--0",
                collectionName: "orange-flag",
                brickName: "4x4",
                x: 0,
                y: 0,
                w: 4,
                h: 4,
              }),
              expect.objectContaining({
                id: textGridItemId,
                gridId,
                itemKey: "text-brick-work--0",
                collectionName: "text-brick",
                brickName: "8x2",
                x: 0,
                y: 4,
                w: 8,
                h: 2,
              }),
            ]),
          );
        }).pipe(Effect.provide(AsyncLive)),
      120_000,
    );
  });
});
