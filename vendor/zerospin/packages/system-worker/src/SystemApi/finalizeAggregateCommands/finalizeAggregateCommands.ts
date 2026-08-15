import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  EncodedAggregateCommandSchema,
  EncodedExecutedAggregateCommandSchema,
  EncodedFailedAggregateCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError } from '@zerospin/error';
import { Effect, Schema, type Context } from 'effect';

import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const finalizeAggregateCommands = Effect.fn(
  'SystemApi.finalizeAggregateCommands',
)(function* (props: {
  request: Parameters<SystemApi['finalizeAggregateCommands']>[0];
  authResults: Context.Tag.Service<typeof SystemApiAuthResults>;
}) {
  return yield* makeApiHandler({
    name: 'SystemApi.finalizeAggregateCommands',
    generationReadRoute: false,
    argsSchema: Schema.mutable(
      Schema.Tuple(
        Schema.Struct({
          aggregateId: makeAbbreviationIdSchema('acct'),
          aggregateName: Schema.String,
          commands: Schema.Array(EncodedAggregateCommandSchema),
        }),
      ),
    ),
    handler: props =>
      Effect.gen(function* () {
        const authResults = yield* SystemApiAuthResults;
        const systemRepo = SystemRepo.getRepo({
          systemId: authResults.systemId,
        });
        const block = yield* makeAsync(() =>
          systemRepo.finalizeAggregateCommands({
            aggregateId: props.aggregateId,
            aggregateName: props.aggregateName,
            commands: props.commands,
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const executedCommands = yield* Schema.validate(
          Schema.Array(EncodedExecutedAggregateCommandSchema),
        )(block.executedCommands).pipe(
          mapParseError({
            code: 'system-api-aggregate-finalize-executed-commands-invalid',
            prefix:
              'Direct aggregate finalization returned non-aggregate executed commands',
          }),
        );
        const failedCommands = yield* Schema.validate(
          Schema.Array(EncodedFailedAggregateCommandSchema),
        )(block.failedCommands).pipe(
          mapParseError({
            code: 'system-api-aggregate-finalize-failed-commands-invalid',
            prefix:
              'Direct aggregate finalization returned non-aggregate failed commands',
          }),
        );

        return {
          executedCommands,
          failedCommands,
          appliedMutations: block.appliedMutations,
          lastAggregateCursor: block.lastAggregateCursor,
          aggregateIndex: block.aggregateIndex,
        };
      }).pipe(
        Effect.withSpan('SystemApi.finalizeAggregateCommands', { root: true }),
      ),
  })(props.request).pipe(
    Effect.provideService(SystemApiAuthResults, props.authResults),
  );
});
