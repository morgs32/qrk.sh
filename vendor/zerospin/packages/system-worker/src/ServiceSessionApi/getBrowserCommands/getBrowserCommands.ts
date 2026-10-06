import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { filterServiceBrowserCommand } from '@zerospin/core/serviceSession/filterServiceBrowserCommand';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import type { IServiceBrowserCommand } from '@zerospin/core/serviceSession/types';
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

import { ServiceActorVersionChain } from '../../ServiceActorVersionChain/ServiceActorVersionChain.js';

const { system } = config;

/*
 * ServiceSessionApi serves reconnect history from ServiceActorVersionChain.
 * The capability binds the definition identity; the request supplies the replay
 * cursor.
 *
 * 1. Validate the replay request.
 * 2. Return invalid replay arguments.
 * 3. Resolve the retained definition log.
 * 4. Read and settle the retained suffix.
 * 5. Return the replay result.
 */
export const getBrowserCommands = Effect.fn(
  'ServiceSessionApi.getBrowserCommands',
)(function* (props: {
  request: IRpcRequest<
    [{ afterExecutedIndex: number; serviceVersion: string }]
  >;
  authResults: {
    readonly claims: Readonly<Record<string, unknown>>;
    readonly actorPath: string;
    readonly sessionName: string;
    readonly serviceSessionLock: IServiceSessionLock;
    readonly serviceName: string;
    serviceVersion: string;
    readonly systemId: ISystemId;
  };
}) {
  const { authResults, request } = props;

  // 1 — require an integer, nonnegative afterExecutedIndex
  const validated = yield* Schema.decodeUnknownEffect(
    Schema.toType(
      Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            serviceVersion: Schema.String,
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
      code: 'service-session-api-arguments-invalid',
      prefix: 'ServiceSessionApi.getBrowserCommands received invalid arguments',
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
      system.services[authResults.serviceName] ?? {},
      authResults.serviceVersion,
    ) ||
    validated.success[0].serviceVersion !== authResults.serviceVersion
  ) {
    return {
      result: yield* encodeError(
        makeZerospinError({
          code: 'service-version-unavailable',
          message:
            'The requested version is not available through this capability',
        }),
      ).pipe(Effect.map(failure => ({ _tag: 'Failure' as const, failure }))),
      link: null,
    };
  }

  // 3 — use the capability-bound definition fields
  const chain = yield* ServiceActorVersionChain.getRepo({
    key: {
      systemId: authResults.systemId,
      serviceName: authResults.serviceName,
      serviceVersion: validated.success[0].serviceVersion,
      actorPath: authResults.actorPath,
      actorName: authResults.serviceSessionLock.actorName,
      actorVersion: authResults.serviceSessionLock.actorVersion,
    },
  });

  // 4 — decode chain.getBrowserCommands after the requested cursor
  const settled = yield* makeAsync<
    IRpcEnvelope<
      Readonly<{
        commands: readonly IServiceBrowserCommand[];
        tip: number;
      }>,
      IZerospinErrorJson
    >
  >(() =>
    chain.getBrowserCommands({
      afterExecutedIndex: validated.success[0].afterExecutedIndex,
    }),
  ).pipe(
    Effect.flatMap(envelope => readRpcEnvelope(envelope)),
    Effect.map(value => ({
      tip: value.tip,
      commands: value.commands.map(output =>
        filterServiceBrowserCommand(
          output,
          authResults.serviceSessionLock.models,
        ),
      ),
    })),
    makeRpcEnvelope,
  );

  // 5 — return the settled replay result without a persisted trace link.
  return { result: settled.result, link: null };
});
