import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Schema, type Context } from 'effect';
import { system } from 'system';

import { VersionedAggregateRepo } from '../../VersionedAggregateRepo/VersionedAggregateRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

/*
 * SystemApi routes secret-key SQL reads to the aggregate current base VAR.
 * This API validates the request and RPC result; VAR owns SQL execution.
 *
 * 1. Validate the query request.
 * 2. Validate the aggregate before resolving its admitted chain.
 * 3. Select the current base version.
 * 4. Query the version-owned materializer.
 * 5. Validate and decode the RPC outcome.
 */
export const executeSelectQuery = Effect.fn('SystemApi.executeSelectQuery')(
  function* (props: {
    request: Parameters<SystemApi['executeSelectQuery']>[0];
    authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
  }) {
    const { request, authResults } = props;

    // 1 — decode aggregate identity and the all/get SQL envelope
    return yield* makeApiHandler({
      name: 'SystemApi.executeSelectQuery',
      argsSchema: Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            aggregateId: makeAbbreviationIdSchema('acct'),
            aggregateName: Schema.String,
            aggregateVersion: Schema.String,
            query: Schema.Struct({
              method: Schema.Literals(['all', 'get']),
              params: Schema.mutable(Schema.Array(Schema.Unknown)),
              rawSql: Schema.String,
            }),
          }),
        ]),
      ),
      handler: handlerProps =>
        Effect.gen(function* () {
          const { aggregateId, aggregateName, aggregateVersion, query } =
            handlerProps;
          const authResults = yield* SystemApiAuthResults;

          // 2 — validate the target before dispatching the query
          yield* getByKeyOrThrow({
            record: system.aggregates,
            key: aggregateName,
            recordKind: 'aggregates',
          });
          // 4 — open VAR at the selected aggregateVersion and call executeSelectQuery
          const aggregateRepo = yield* VersionedAggregateRepo.getRepo({
            key: {
              systemId: authResults.systemId,
              aggregateId,
              aggregateName,
              aggregateVersion,
            },
          });
          const encodedUnknown = yield* makeAsync(() =>
            aggregateRepo.executeSelectQuery({ aggregateName, query }),
          );

          // 5 — require a Success or encoded ZerospinError Failure before decodeRpc
          const encoded = yield* Schema.decodeUnknownEffect(
            Schema.Union([
              Schema.Struct({
                _tag: Schema.Literal('Success'),
                success: Schema.Unknown,
              }),
              Schema.Struct({
                _tag: Schema.Literal('Failure'),
                failure: Schema.toEncoded(ZerospinError.schema),
              }),
            ]),
          )(encodedUnknown).pipe(
            mapParseError({
              code: 'aggregate-select-query-rpc-invalid',
              prefix:
                'Failed to decode VersionedAggregateRepo select-query RPC',
            }),
          );
          return yield* decodeRpc(encoded);
        }).pipe(
          Effect.withSpan('SystemApi.executeSelectQuery', { root: true }),
        ),
    })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
  },
);
