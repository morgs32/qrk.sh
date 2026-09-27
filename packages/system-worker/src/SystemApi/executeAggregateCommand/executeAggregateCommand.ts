import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { getVersion } from '@zerospin/core/contracts/getVersion';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import config from 'config';
import { Effect, Schema, type Context } from 'effect';

import { stageDirectActorCommand } from '../../AggregateActorVersionRepo/stageDirectActorCommand.js';
import { AggregateChain } from '../../AggregateChain/AggregateChain.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

const { system } = config;

/*
 * Secret-key callers submit a complete encoded aggregate command through
 * SystemApi. This boundary routes to AggregateChain and returns its
 * terminal result through the linked RPC handler.
 *
 * 1. Capture the granted capability.
 * 2. Validate the complete command.
 * 3. Read the deployment identity.
 * 4. Validate the aggregate before resolving its command owner.
 * 5. Finalize and decode the owner result.
 */
export const executeAggregateCommand = Effect.fn(
  'SystemApi.executeAggregateCommand',
)(function* (props: {
  request: Parameters<SystemApi['executeAggregateCommand']>[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  // 1 — keep request data separate from capability-bound systemId
  const { authResults: requestedAuthResults, request } = props;

  // 2 — decode EncodedAggregateCommandSchema without rebuilding its fields
  return yield* makeApiHandler({
    name: 'SystemApi.executeAggregateCommand',
    argsSchema: Schema.mutable(
      Schema.Tuple([
        Schema.Struct({
          aggregateVersion: Schema.String,
          command: EncodedAggregateCommandSchema,
        }),
      ]),
    ),
    handler: ({ command, aggregateVersion }) =>
      Effect.gen(function* () {
        // 3 — take systemId from SystemApiAuthResults
        const authResults = yield* SystemApiAuthResults;

        // 4 — validate the target before resolving its command owner
        const aggregateId = yield* Schema.decodeUnknownEffect(
          makeAbbreviationIdSchema('acct'),
        )(command.aggregateId).pipe(
          mapParseError({
            code: 'system-api-arguments-invalid',
            prefix:
              'SystemApi.executeAggregateCommand received an invalid aggregateId',
          }),
        );
        yield* getByKeyOrThrow({
          record: system.aggregates,
          key: command.aggregateName,
          recordKind: 'aggregates',
        });
        const chain = yield* AggregateChain.getRepo({
          key: {
            systemId: authResults.systemId,
            aggregateId,
            aggregateName: command.aggregateName,
          },
        });

        const actor = yield* resolveAggregateActorVersion(
          system.aggregates[command.aggregateName] ?? {},
          command,
        );
        const authored = actor.contracts[command.commandName];
        if (authored === undefined) {
          return yield* Effect.fail(
            makeZerospinError('contract-failure-binding-missing'),
          );
        }
        yield* getVersion(authored, command.contractVersion);

        yield* stageDirectActorCommand({
          systemId: authResults.systemId,
          aggregateVersion,
          actor,
          command,
        });

        // 5 — forward the full command to AggregateChain.executeAggregateCommand
        return yield* makeAsync<
          Awaited<ReturnType<AggregateChain['executeAggregateCommand']>>
        >(() =>
          chain.executeAggregateCommand({ command, aggregateVersion }),
        ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
      }).pipe(
        Effect.withSpan('SystemApi.executeAggregateCommand', { root: true }),
      ),
  })(request).pipe(
    Effect.provideService(SystemApiAuthResults, requestedAuthResults),
  );
});
