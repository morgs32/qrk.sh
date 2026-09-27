import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { EncodedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { getVersion } from '@zerospin/core/contracts/getVersion';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import config from 'config';
import { Effect, Schema, type Context } from 'effect';

import { ServiceChain } from '../../ServiceChain/ServiceChain.js';
import { ServiceVersionRepo } from '../../ServiceVersionRepo/ServiceVersionRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

const { system } = config;

/*
 * Secret-key callers submit a complete encoded service command through
 * SystemApi. This boundary routes to ServiceChain and returns its
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
        const chain = yield* ServiceChain.getRepo({
          key: {
            systemId: authResults.systemId,
            serviceName: command.serviceName,
          },
        });

        const owner = system.services[command.serviceName]?.[serviceVersion];
        const authored = Object.values(owner?.contracts ?? {}).find(
          candidate => candidate.commandName === command.commandName,
        );
        if (authored === undefined) {
          return yield* Effect.fail(
            makeZerospinError('contract-failure-binding-missing'),
          );
        }
        yield* getVersion(authored, command.contractVersion);

        // 5 — forward the full command to ServiceChain.executeServiceCommand
        const receipt = yield* makeAsync<
          Awaited<ReturnType<ServiceChain['admitServiceCommand']>>
        >(() => chain.admitServiceCommand({ command })).pipe(
          Effect.flatMap(envelope => readRpcEnvelope(envelope)),
        );
        const repo = yield* ServiceVersionRepo.getRepo({
          key: {
            systemId: authResults.systemId,
            serviceName: command.serviceName,
            serviceVersion,
          },
        });
        return yield* makeAsync<
          Awaited<ReturnType<ServiceVersionRepo['execute']>>
        >(() => repo.execute({ serviceIndex: receipt.serviceIndex })).pipe(
          Effect.flatMap(envelope => readRpcEnvelope(envelope)),
        );
      }).pipe(
        Effect.withSpan('SystemApi.executeServiceCommand', { root: true }),
      ),
  })(request).pipe(
    Effect.provideService(SystemApiAuthResults, requestedAuthResults),
  );
});
