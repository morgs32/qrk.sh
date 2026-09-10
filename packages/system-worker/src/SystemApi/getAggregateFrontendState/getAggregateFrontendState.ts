import { makeAsync } from '@zerospin/core/async/makeAsync';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { AggregateFrontendSyncStateSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import type { IAggregateFrontendSyncState } from '@zerospin/core/session/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { env } from 'cloudflare:workers';
import { Effect, Schema, type Context } from 'effect';

import { adaptFrontendResource } from '../../StaticSystem/adaptFrontendResource/adaptFrontendResource.js';
import { SelectedAggregateFrontendLockSchema } from '../../StaticSystem/frontendSpecSchemas.js';
import { validateAggregateFrontendLock } from '../../StaticSystem/validateAggregateFrontendLock/validateAggregateFrontendLock.js';
import { UserVersionedAggregateRepo } from '../../UserVersionedAggregateRepo/UserVersionedAggregateRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

/*
 * Secret-key callers request an aggregate frontend snapshot through SystemApi.
 * The API selects the base version, reads its Replica Repo, and adapts resources
 * to the lock-selected model versions. The materializer owns synchronization
 * and durable state; userId and frontend fields are explicit caller arguments.
 *
 * 1. Validate the request through the shared linked RPC handler.
 * 2. Validate the selected frontend lock.
 * 3. Decode the selected lock result.
 * 4. Select the aggregate current base version.
 * 5. Resolve the canonical frontend materializer.
 * 6. Read and validate the materializer RPC result.
 * 7. Adapt resources to the selected model versions.
 * 8. Return adapted resources with canonical progress.
 * 9. Supply the capability-bound systemId to the handler.
 */
export const getAggregateFrontendState = Effect.fn(
  'SystemApi.getAggregateFrontendState',
)(function* (props: {
  request: Parameters<SystemApi['getAggregateFrontendState']>[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  const { authResults, request } = props;

  // 1 — validate arguments and delegate encoding and telemetry to makeApiHandler
  return yield* makeApiHandler({
    name: 'SystemApi.getAggregateFrontendState',
    argsSchema: Schema.mutable(
      Schema.Tuple([
        Schema.Struct({
          aggregateId: makeAbbreviationIdSchema('acct'),
          aggregateName: Schema.String,
          aggregateVersion: Schema.String,
          userId: Schema.NonEmptyString,
          frontendName: Schema.String,
          aggregateFrontendLock: AggregateFrontendLockSchema,
        }),
      ]),
    ),
    handler: args =>
      Effect.gen(function* () {
        const {
          aggregateFrontendLock,
          aggregateId,
          aggregateName,
          frontendName,
          userId,
        } = args;

        // 2 — resolve the authored aggregate frontend selection
        const selectedUnknown = yield* validateAggregateFrontendLock({
          aggregateVersion: args.aggregateVersion,
          aggregateName,
          frontendName,
          aggregateFrontendLock,
        });

        // 3 — check SelectedAggregateFrontendLockSchema before adapting resources
        const selected = yield* Schema.decodeUnknownEffect(
          SelectedAggregateFrontendLockSchema,
        )(selectedUnknown, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'system-runtime-aggregate-frontend-lock-invalid',
            prefix:
              'The static System returned an invalid selected aggregate frontend lock',
          }),
        );

        // 4 — decode AggregateChain.getBaseAggregateVersion
        const aggregateVersion = args.aggregateVersion;

        // 5 — open UserVersionedAggregateRepo with the supplied view fields
        const aggregateFrontendRepo = yield* UserVersionedAggregateRepo.getRepo(
          {
            key: {
              systemId: env.ZEROSPIN_SYSTEM_ID,
              aggregateVersion,
              aggregateId,
              aggregateName,
              userId,
            },
          },
        );

        // 6 — decode the success snapshot or encoded ZerospinError before decodeRpc
        const canonicalStateUnknown = yield* makeAsync(() =>
          aggregateFrontendRepo.getState({
            outstandingCommandIds: [],
            aggregateId,
            aggregateName,
            userId,
            frontendName,
          }),
        );
        const canonicalStateEncoded = yield* Schema.decodeUnknownEffect(
          Schema.Union([
            Schema.Struct({
              _tag: Schema.Literal('Success'),
              success: Schema.toType(AggregateFrontendSyncStateSchema),
            }),
            Schema.Struct({
              _tag: Schema.Literal('Failure'),
              failure: Schema.toEncoded(ZerospinError.schema),
            }),
          ]),
        )(canonicalStateUnknown).pipe(
          mapParseError({
            code: 'aggregate-frontend-state-rpc-invalid',
            prefix: 'Failed to decode UserVersionedAggregateRepo state RPC',
          }),
        );
        const canonicalState = yield* decodeRpc(canonicalStateEncoded);

        // 7 — skip models absent from the lock and validate each adapted encoded resource
        const resources: IAggregateFrontendSyncState['resources'][number][] =
          [];
        for (const resource of canonicalState.resources) {
          const requestedModel = Object.values(
            selected.aggregateFrontendLock.models,
          ).find(model => model.modelName === resource.modelName);
          if (requestedModel === undefined) {
            continue;
          }
          const adaptedUnknown = yield* adaptFrontendResource({
            owner: {
              kind: 'aggregate',
              aggregateVersion,
              aggregateName,
            },
            frontendName,
            modelName: resource.modelName,
            modelVersion: requestedModel.version,
            resource,
          });
          const adapted = yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              modelName: Schema.String,
              resource: EncodedResourceSchema,
            }),
          )(adaptedUnknown, { onExcessProperty: 'error' }).pipe(
            mapParseError({
              code: 'aggregate-frontend-resource-adaptation-result-invalid',
              prefix:
                'The static System returned an invalid adapted frontend resource',
            }),
          );
          resources.push(adapted.resource);
        }

        // 8 — retain the snapshot cursor and identity
        return {
          ...canonicalState,
          resources,
        };
      }).pipe(
        Effect.withSpan('SystemApi.getAggregateFrontendState', { root: true }),
      ),
  })(request).pipe(
    // 9 — bind the system identity used by the shared handler
    Effect.provideService(SystemApiAuthResults, authResults),
  );
});
