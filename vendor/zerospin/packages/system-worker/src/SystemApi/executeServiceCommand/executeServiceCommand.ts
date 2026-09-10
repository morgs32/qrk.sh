import { makeAsync } from '@zerospin/core/async/makeAsync';
import { EncodedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { Effect, Schema, type Context } from 'effect';
import { system } from 'system';

import { ServiceAdmittedChain } from '../../ServiceAdmittedChain/ServiceAdmittedChain.js';
import { VersionedServiceRepo } from '../../VersionedServiceRepo/VersionedServiceRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

/*
 * Secret-key callers submit a complete encoded service command through
 * SystemApi. This boundary routes to ServiceAdmittedChain and returns its
 * admission receipt through the linked RPC handler.
 *
 * 1. Capture the granted capability.
 * 2. Validate the complete command.
 * 3. Read the deployment identity.
 * 4. Resolve the command owner.
 * 5. Admit and decode the durable receipt.
 */
export const executeServiceCommand = Effect.fn(
  'SystemApi.executeServiceCommand',
)(function* (props: {
  request: Parameters<SystemApi['executeServiceCommand']>[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  // 1 — keep request data separate from capability-bound systemId
  const { authResults: requestedAuthResults, request } = props;

  // 2 — decode EncodedServiceCommandSchema without rebuilding its fields
  return yield* makeApiHandler({
    name: 'SystemApi.executeServiceCommand',
    argsSchema: Schema.mutable(
      Schema.Tuple([
        Schema.Struct({
          serviceVersion: Schema.String,
          command: EncodedServiceCommandSchema,
        }),
      ]),
    ),
    handler: ({ command, serviceVersion }) =>
      Effect.gen(function* () {
        // 3 — take systemId from SystemApiAuthResults
        const authResults = yield* SystemApiAuthResults;

        // 4 — combine the bound systemId with owner fields on the decoded command
        yield* getByKeyOrThrow({
          record: system.services[command.serviceName] ?? {},
          key: serviceVersion,
          recordKind: 'service versions',
        });
        const chain = yield* ServiceAdmittedChain.getRepo({
          key: {
            systemId: authResults.systemId,
            serviceName: command.serviceName,
          },
        });

        // 5 — forward the full command to ServiceAdmittedChain.executeServiceCommand
        const receipt = yield* makeAsync<
          Awaited<ReturnType<ServiceAdmittedChain['admitServiceCommand']>>
        >(() => chain.admitServiceCommand({ command })).pipe(
          Effect.flatMap(decodeRpc),
        );
        const repo = yield* VersionedServiceRepo.getRepo({
          key: {
            systemId: authResults.systemId,
            serviceName: command.serviceName,
            serviceVersion,
          },
        });
        return yield* makeAsync<
          Awaited<ReturnType<VersionedServiceRepo['execute']>>
        >(() => repo.execute({ serviceIndex: receipt.serviceIndex })).pipe(
          Effect.flatMap(decodeRpc),
        );
      }).pipe(
        Effect.withSpan('SystemApi.executeServiceCommand', { root: true }),
      ),
  })(request).pipe(
    Effect.provideService(SystemApiAuthResults, requestedAuthResults),
  );
});
