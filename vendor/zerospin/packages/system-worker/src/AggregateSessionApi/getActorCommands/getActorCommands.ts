import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IAggregateActorCommand } from '@zerospin/core/aggregateSession/types';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  encodeError,
  makeZerospinError,
  mapParseError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import {
  makeRpcEnvelope,
  type IRpcEnvelope,
  type IRpcRequest,
} from '@zerospin/logger';
import config from 'config';
import { Effect, Result, Schema } from 'effect';

import { AggregateActorVersionChain } from '../../AggregateActorVersionChain/AggregateActorVersionChain.js';
import { deliverActorCommand } from '../../deliverActorCommand/deliverActorCommand.js';

const { system } = config;

/*
 * AggregateSessionApi serves reconnect history from AggregateActorVersionChain.
 * The capability binds the definition identity; the request supplies the replay
 * cursor and aggregateVersion.
 *
 * 1. Validate the replay request.
 * 2. Return invalid replay arguments.
 * 3. Resolve the retained definition log.
 * 4. Read and settle the retained suffix.
 * 5. Return the replay result.
 */
export const getActorCommands = Effect.fn(
  'AggregateSessionApi.getActorCommands',
)(function* (props: {
  request: IRpcRequest<
    [{ afterExecutedIndex: number; aggregateVersion: string }]
  >;
  authResults: {
    readonly aggregateId: IAggregateId;
    readonly aggregateName: string;
    aggregateVersion: string;
    readonly identity: Readonly<Record<string, unknown>>;
    actorName: string;
    actorVersion: string;
    readonly actorPath: string;
    readonly sessionName: string;
    readonly aggregateSessionLock: IAggregateSessionLock;
    readonly systemId: ISystemId;
  };
}) {
  const { authResults, request } = props;

  // 1 — require an integer, nonnegative afterExecutedIndex and string aggregateVersion
  const validated = yield* Schema.decodeUnknownEffect(
    Schema.toType(
      Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            aggregateVersion: Schema.String,
            afterExecutedIndex: Schema.Number.check(
              Schema.isInt(),
              Schema.isGreaterThanOrEqualTo(0),
            ),
          }),
        ]),
      ),
    ),
  )(request.args, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'aggregate-session-api-arguments-invalid',
      prefix: 'AggregateSessionApi.getActorCommands received invalid arguments',
    }),
    Effect.result,
  );

  // 2 — encode the argument failure with a null link
  if (Result.isFailure(validated)) {
    return {
      result: yield* encodeError(validated.failure).pipe(
        Effect.map(failure => ({ _tag: 'Failure' as const, failure })),
      ),
      link: null,
    };
  }

  if (
    !Object.hasOwn(
      system.aggregates[authResults.aggregateName] ?? {},
      authResults.aggregateVersion,
    ) ||
    validated.success[0].aggregateVersion !== authResults.aggregateVersion
  ) {
    return {
      result: yield* encodeError(
        makeZerospinError({
          code: 'aggregate-version-unavailable',
          message:
            'The requested version is not available through this capability',
        }),
      ).pipe(Effect.map(failure => ({ _tag: 'Failure' as const, failure }))),
      link: null,
    };
  }

  // 3 — use the capability-bound definition fields and caller-selected version
  const chain = yield* AggregateActorVersionChain.getRepo({
    key: {
      systemId: authResults.systemId,
      aggregateVersion: validated.success[0].aggregateVersion,
      aggregateId: authResults.aggregateId,
      aggregateName: authResults.aggregateName,
      actorName: authResults.actorName,
      actorVersion: authResults.actorVersion,
      actorPath: authResults.actorPath,
    },
  });

  // 4 — decode chain.getActorCommands after the requested cursor
  const settled = yield* makeAsync<
    IRpcEnvelope<
      Readonly<{
        commands: readonly IAggregateActorCommand[];
        tip: number;
      }>,
      IZerospinErrorJson
    >
  >(() =>
    chain.getActorCommands({
      afterExecutedIndex: validated.success[0].afterExecutedIndex,
      definition: {
        name: authResults.sessionName,
        identity: authResults.identity,
        lock: authResults.aggregateSessionLock,
      },
    }),
  ).pipe(
    Effect.flatMap(envelope => readRpcEnvelope(envelope)),
    Effect.flatMap(page =>
      Effect.forEach(page.commands, command =>
        deliverActorCommand({ ...authResults, command }),
      ).pipe(Effect.map(commands => ({ tip: page.tip, commands }))),
    ),
    makeRpcEnvelope,
  );

  // 5 — encode the commands/tip or failure without emitting a trace link
  return {
    result: settled.result,
    link: null,
  };
});
