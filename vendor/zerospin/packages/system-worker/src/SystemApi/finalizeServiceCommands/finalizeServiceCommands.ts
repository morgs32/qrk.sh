import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  EncodedExecutedServiceCommandSchema,
  EncodedFailedServiceCommandSchema,
  EncodedServiceCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError } from '@zerospin/error';
import { Effect, Schema, type Context } from 'effect';

import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const finalizeServiceCommands = Effect.fn(
  'SystemApi.finalizeServiceCommands',
)(function* (props: {
  request: Parameters<SystemApi['finalizeServiceCommands']>[0];
  authResults: Context.Tag.Service<typeof SystemApiAuthResults>;
}) {
  return yield* makeApiHandler({
    name: 'SystemApi.finalizeServiceCommands',
    generationReadRoute: false,
    argsSchema: Schema.mutable(
      Schema.Tuple(
        Schema.Struct({
          serviceName: Schema.String,
          commands: Schema.Array(EncodedServiceCommandSchema),
        }),
      ),
    ),
    handler: props =>
      Effect.gen(function* () {
        const authResults = yield* SystemApiAuthResults;
        const systemRepo = SystemRepo.getRepo({
          systemId: authResults.systemId,
        });
        const finalization = yield* makeAsync(() =>
          systemRepo.finalizeServiceCommands({
            commands: props.commands,
            serviceName: props.serviceName,
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const executedCommands = yield* Schema.validate(
          Schema.Array(EncodedExecutedServiceCommandSchema),
        )(finalization.executedCommands).pipe(
          mapParseError({
            code: 'system-api-service-finalize-executed-commands-invalid',
            prefix:
              'Direct service finalization returned non-service executed commands',
          }),
        );
        const failedCommands = yield* Schema.validate(
          Schema.Array(EncodedFailedServiceCommandSchema),
        )(finalization.failedCommands).pipe(
          mapParseError({
            code: 'system-api-service-finalize-failed-commands-invalid',
            prefix:
              'Direct service finalization returned non-service failed commands',
          }),
        );

        return {
          executedCommands,
          failedCommands,
        };
      }).pipe(
        Effect.withSpan('SystemApi.finalizeServiceCommands', { root: true }),
      ),
  })(props.request).pipe(
    Effect.provideService(SystemApiAuthResults, props.authResults),
  );
});
