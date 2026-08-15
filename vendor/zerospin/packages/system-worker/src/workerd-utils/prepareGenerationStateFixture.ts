import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { env, runInDurableObject } from 'cloudflare:test';
import { and, eq, getTableColumns, isNull } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { system } from '../fixtures/system.js';
import { managedRuntime } from '../managedRuntime.js';
import { activateDeploy } from '../SystemRepo/activateDeploy/activateDeploy.js';
import { allocateDeploy } from '../SystemRepo/allocateDeploy/allocateDeploy.js';
import { initializeSystemRepo } from '../SystemRepo/initializeSystemRepo.js';
import { migrateSystemRepo } from '../SystemRepo/migrateSystemRepo.js';
import {
  SystemRepo,
  systemRepoDbConfig,
  systemRepoDrizzleSchemas,
} from '../SystemRepo/SystemRepo.js';

/**
 * Allocates and resumes one real Dev deploy through the singleton SystemRepo's
 * named lifecycle Effects, returning its durable terminal status.
 */
export const prepareGenerationStateFixture = Effect.fn(
  'prepareGenerationStateFixture',
)(function* (props: { clean: boolean; workerVersionId: string }) {
  const systemRepo = SystemRepo.getRepo({
    systemId: env.ZEROSPIN_SYSTEM_ID,
  });
  const body = yield* Effect.promise(() =>
    runInDurableObject(systemRepo, (_instance, state) =>
      managedRuntime.runPromise(
        Effect.gen(function* () {
          const { db } = yield* initializeSystemRepo({
            storage: state.storage,
            dbConfig: systemRepoDbConfig,
          });
          yield* migrateSystemRepo({
            db,
            schema: systemRepoDbConfig.schema,
          });
          const allocation = yield* allocateDeploy({
            db,
            workerVersionId: props.workerVersionId,
            clean: props.clean,
            cleanRequestId: null,
            systemSpec: makeSystemSpec({ system }),
            selectionTable: systemRepoDrizzleSchemas.selection,
            selectionColumns: getTableColumns(
              systemRepoDrizzleSchemas.selection,
            ),
            deployTable: systemRepoDrizzleSchemas.deploy,
            deployColumns: getTableColumns(systemRepoDrizzleSchemas.deploy),
          });
          yield* activateDeploy({
            db,
            configuredSystemId: env.ZEROSPIN_SYSTEM_ID,
            executingWorkerVersionId: props.workerVersionId,
            deployId: allocation.deployId,
            cleanRequestId: null,
            submitTargetedSeed: ({ generationId }) =>
              Effect.fail(
                new ZerospinError({
                  code: 'test-generation-seed-unexpected',
                  message:
                    'The empty-seed workerd fixture received a targeted seed',
                  extra: { generationId },
                }),
              ),
            drainSystemWrites: ({ generationId }) =>
              Effect.sync(() => {
                const acceptedWrite = db
                  .select()
                  .from(systemRepoDrizzleSchemas.systemWrites)
                  .where(
                    and(
                      eq(
                        systemRepoDrizzleSchemas.systemWrites.generationId,
                        generationId,
                      ),
                      isNull(systemRepoDrizzleSchemas.systemWrites.result),
                    ),
                  )
                  .get();
                if (acceptedWrite !== undefined) {
                  throw new ZerospinError({
                    code: 'test-generation-write-unexpected',
                    message:
                      'The empty-seed workerd fixture accepted a write that requires delivery',
                    extra: { generationId },
                  });
                }
              }),
            selectionTable: systemRepoDrizzleSchemas.selection,
            selectionColumns: getTableColumns(
              systemRepoDrizzleSchemas.selection,
            ),
            deployTable: systemRepoDrizzleSchemas.deploy,
            deployColumns: getTableColumns(systemRepoDrizzleSchemas.deploy),
            generationStateTable: systemRepoDrizzleSchemas.generationState,
            generationStateColumns: getTableColumns(
              systemRepoDrizzleSchemas.generationState,
            ),
            drainBoundsTable: systemRepoDrizzleSchemas.drainBounds,
            drainBoundsColumns: getTableColumns(
              systemRepoDrizzleSchemas.drainBounds,
            ),
            replayCompletionsTable: systemRepoDrizzleSchemas.replayCompletions,
            replayCompletionsColumns: getTableColumns(
              systemRepoDrizzleSchemas.replayCompletions,
            ),
            repoTable: systemRepoDrizzleSchemas.repos,
          }).pipe(Effect.either);
          return db
            .select()
            .from(systemRepoDrizzleSchemas.deploy)
            .where(eq(systemRepoDrizzleSchemas.deploy.id, allocation.deployId))
            .get();
        }),
      ),
    ),
  ).pipe(
    Effect.flatMap(
      Schema.decodeUnknown(
        Schema.Struct({
          id: Schema.String,
          workerVersionId: Schema.String,
          generationId: Schema.String,
          clean: Schema.Boolean,
          status: Schema.Literal('activating', 'succeeded', 'failed'),
          activationCheckpoint: Schema.Literal(
            'allocated',
            'generation-prepared',
            'continuous-replay',
            'pre-cut-ready',
            'ownership-cut',
            'source-writes-terminal',
            'fixed-point-drained',
            'final-replay-complete',
          ),
          failure: Schema.NullOr(Schema.String),
        }),
      ),
    ),
    mapParseError({
      code: 'test-system-deploy-status-invalid',
      prefix: 'SystemRepo returned an invalid deploy status fixture',
      extra: { workerVersionId: props.workerVersionId },
    }),
  );
  if (body.status !== 'succeeded') {
    return yield* new ZerospinError({
      code: 'test-system-deploy-failed',
      message: 'SystemRepo fixture deploy failed',
      cause: ZerospinError.prettyUnknownFailure(body.failure),
      extra: {
        deployId: body.id,
        workerVersionId: body.workerVersionId,
        status: body.status,
      },
    });
  }
  return { ...body, deployId: body.id, failure: null };
});
