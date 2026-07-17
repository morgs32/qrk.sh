import type { IActor } from '@zerospin/core/actorController/types';
import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb';
import type { IDrizzleRelationsFromModels } from '@zerospin/core/drizzle/types';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import type {
  IFrontendController,
  InferFrontendModels,
} from '@zerospin/core/frontendController/types';
import type { IActorId } from '@zerospin/core/models/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import { type PublishableKey } from '@zerospin/core/services/PublishableKey';
import { SignatureFactory } from '@zerospin/core/services/SignatureFactory';
import { type ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { applyFrontendState } from '@zerospin/core/session/applyFrontendState';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import type {
  ISession,
  ISessionSchema,
  ISessionWaSqliteDb,
} from '@zerospin/core/session/types';
import type { ISignatureFactory } from '@zerospin/core/utils/types';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { fetchActor } from '@zerospin/frontend/fetchActor';
import { fetchFrontendState } from '@zerospin/frontend/fetchFrontendState';
import {
  annotateFunctionSpan,
  type TelemetryCollector,
} from '@zerospin/logger';
import { makeSharedWorkerSession } from '@zerospin/shared-worker/makeSharedWorkerSession';
import { Effect } from 'effect';

import { acquireFrontendWebSocket } from './acquireFrontendWebSocket';
import type { IBrowserUserController } from './makeBrowserUserController';

/*
 * 1. Build combined session schema from frontend models + sessionRepoTables.
 * 2. Fetch actor identity via signed FrontendApi RPC.
 * 3. Open main-thread WASM SQLite session DB.
 * 4. Fetch frontendState from FrontendApi.
 * 5. Apply frontendState into the main-thread session db.
 * 6. Publish initialized session store with sync and pushed-rebase watermarks.
 * 7. Acquire frontend WebSocket release for browser runtimes.
 */
export const bootstrapBrowserSession = Effect.fn('bootstrapBrowserSession')(
  function* <FRONTEND extends IFrontendController>(props: {
    session: ISession<FRONTEND>;
    browserUserController: IBrowserUserController;
    generateSignature: ISignatureFactory;
  }): Effect.fn.Return<
    {
      db: ISessionWaSqliteDb<
        InferFrontendModels<FRONTEND>,
        IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
      >;
      schema: ISessionSchema<InferFrontendModels<FRONTEND>>;
      models: InferFrontendModels<FRONTEND>;
      actor: IActor;
      releaseBrowserSession: Effect.Effect<void>;
    },
    IAnyError,
    | Async
    | CuidFactory
    | PublishableKey
    | SignatureFactory
    | TelemetryCollector
    | ZerospinApisUrl
  > {
    const { browserUserController, session, generateSignature } = props;

    // 1 — resource tables + sessionRepoTables
    const models = getFrontendDbModels(session.frontend);
    const dbConfig = makeResourceDbConfig({
      models,
      otherTables: sessionRepoTables,
    });
    const schema: ISessionSchema<InferFrontendModels<FRONTEND>> =
      dbConfig.schema;

    const signatureLayer = Effect.provideService(
      SignatureFactory,
      generateSignature,
    );

    // 2 — RPC before WASM so capnweb batch is not blocked on first wa-sqlite load
    const { actor, generationId, systemId, systemVersion } =
      yield* fetchActor({
        session,
      }).pipe(signatureLayer);

    // 3 — main-thread in-memory WASM SQLite session DB
    const db = yield* makeMigratedInMemoryWasmSqliteDb({
      dbConfig,
    });
    const { accountId, actorId } = actor;

    const isSharedWorkerEnabled =
      session.store.getState().isSharedWorkerEnabled;
    const sharedWorkerSession = isSharedWorkerEnabled
      ? yield* makeSharedWorkerSession({ generationId, systemId })
      : null;
    const releaseSharedWorker = sharedWorkerSession?.release ?? Effect.void;
    let releaseFrontendWebSocket: Effect.Effect<void> = Effect.void;

    return yield* Effect.gen(function* () {
      const sharedWorkerUserApi =
        sharedWorkerSession === null
          ? null
          : yield* makeAsync(
              () =>
                sharedWorkerSession.api.getUserApi({
                  userId: browserUserController.userId,
                }),
              ZerospinError.catch({
                code: 'failed-to-initialize-shared-worker-user-api',
                message: 'Failed to initialize SharedWorker UserApi',
              }),
            );
      browserUserController.store
        .getState()
        .setSharedWorkerUserApi(sharedWorkerUserApi);
      zerospinDevtoolsStore
        .getState()
        .setSharedWorkerUserApi(sharedWorkerUserApi);

      let appliedAccountName: string | null = null;
      let appliedActorId: IActorId | null = null;
      let appliedSystemWorkerName: string | null = null;
      let appliedFrontendIndex: number | null = null;

      // 4 — fetch FrontendApi state for the main-thread session db.
      const frontendState = yield* fetchFrontendState({ session }).pipe(
        signatureLayer,
      );

      // 5 — hydrate main-thread db from frontendState.
      yield* applyFrontendState({
        frontend: session.frontend,
        db,
        schema,
        models,
        frontendState,
      });

      appliedActorId = frontendState.actorId;
      appliedAccountName = frontendState.accountName;
      appliedSystemWorkerName = frontendState.systemWorkerName;
      appliedFrontendIndex = frontendState.frontendIndex;

      if (
        appliedAccountName === null ||
        appliedActorId === null ||
        appliedSystemWorkerName === null
      ) {
        return yield* new ZerospinError({
          code: 'frontend-state-not-resolved',
          message: 'Bootstrap did not resolve frontend state',
        });
      }

      // 6 — publish initialized store with both bootstrap watermarks
      session.store.setState({
        sessionId: session.sessionId,
        db,
        schema,
        models,
        accountId,
        accountName: appliedAccountName,
        actorId,
        generationId,
        systemVersion,
        systemWorkerName: appliedSystemWorkerName,
        vfsName: null,
        isInitialized: true,
        frontendIndex: appliedFrontendIndex,
        lastRebasedPushedCursor: frontendState.lastRebasedPushedCursor,
      });

      releaseFrontendWebSocket = yield* acquireFrontendWebSocket({
        session,
        accountId,
        actorId,
        generationId,
        generateSignature,
      });

      return {
        db,
        schema,
        models,
        actor: {
          accountId,
          actorId: appliedActorId,
        },
        releaseBrowserSession: releaseFrontendWebSocket.pipe(
          Effect.zipRight(
            Effect.sync(() => {
              browserUserController.store
                .getState()
                .setSharedWorkerUserApi(null);
              zerospinDevtoolsStore.getState().setSharedWorkerUserApi(null);
            }),
          ),
          Effect.zipRight(releaseSharedWorker),
        ),
      };
    }).pipe(
      Effect.tapError(() =>
        releaseFrontendWebSocket.pipe(
          Effect.zipRight(
            Effect.sync(() => {
              browserUserController.store
                .getState()
                .setSharedWorkerUserApi(null);
              zerospinDevtoolsStore.getState().setSharedWorkerUserApi(null);
            }),
          ),
          Effect.zipRight(releaseSharedWorker),
        ),
      ),
    );
  },
  annotateFunctionSpan,
);
