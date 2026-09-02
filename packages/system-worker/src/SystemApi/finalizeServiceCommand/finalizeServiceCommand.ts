import { makeAsync } from '@zerospin/core/async/makeAsync';
import { EncodedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect, Schema, type Context } from 'effect';

import { getServiceCommandChain } from '../../ServiceCommandChain/getServiceCommandChain/getServiceCommandChain.js';
import { ServiceCommandChain } from '../../ServiceCommandChain/ServiceCommandChain.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const finalizeServiceCommand = Effect.fn(
  'SystemApi.finalizeServiceCommand',
)(function* (props: {
  request: Parameters<SystemApi['finalizeServiceCommand']>[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  const { authResults: requestedAuthResults, request } = props;
  return yield* makeApiHandler({
    name: 'SystemApi.finalizeServiceCommand',
    argsSchema: Schema.mutable(Schema.Tuple([EncodedServiceCommandSchema])),
    handler: command =>
      Effect.gen(function* () {
        const authResults = yield* SystemApiAuthResults;
        const chain = yield* getServiceCommandChain({
          key: {
            systemId: authResults.systemId,
            serviceName: command.serviceName,
          },
        });
        return yield* makeAsync<
          Awaited<ReturnType<ServiceCommandChain['finalizeServiceCommand']>>
        >(() => chain.finalizeServiceCommand({ command })).pipe(
          Effect.flatMap(decodeRpc),
        );
      }).pipe(
        Effect.withSpan('SystemApi.finalizeServiceCommand', { root: true }),
      ),
  })(request).pipe(
    Effect.provideService(SystemApiAuthResults, requestedAuthResults),
  );
});
