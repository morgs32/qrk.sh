import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Schema, type Context } from 'effect';

import { getMaterializedAggregateRepo } from '../../MaterializedAggregateRepo/getMaterializedAggregateRepo/getMaterializedAggregateRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const executeSelectQuery = Effect.fn('SystemApi.executeSelectQuery')(
  function* (props: {
    request: Parameters<SystemApi['executeSelectQuery']>[0];
    authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
  }) {
    const { request, authResults } = props;
    return yield* makeApiHandler({
      name: 'SystemApi.executeSelectQuery',
      argsSchema: Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            aggregateId: makeAbbreviationIdSchema('acct'),
            aggregateName: Schema.String,
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
          const { aggregateId, aggregateName, query } = handlerProps;
          const authResults = yield* SystemApiAuthResults;
          const aggregateRepo = yield* getMaterializedAggregateRepo({
            key: {
              systemId: authResults.systemId,
              aggregateId,
              aggregateName,
            },
          });
          const encodedUnknown = yield* makeAsync(() =>
            aggregateRepo.executeSelectQuery({ aggregateName, query }),
          );
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
              prefix: 'Failed to decode MaterializedAggregateRepo select-query RPC',
            }),
          );
          return yield* decodeRpc(encoded);
        }).pipe(
          Effect.withSpan('SystemApi.executeSelectQuery', { root: true }),
        ),
    })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
  },
);
