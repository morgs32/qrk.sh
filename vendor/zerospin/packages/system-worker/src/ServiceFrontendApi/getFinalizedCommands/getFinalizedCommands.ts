import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IEncodedCommand } from '@zerospin/core/contracts/types';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IServiceFrontendFinalizedCommand } from '@zerospin/core/serviceSession/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import type { IRpcRequest } from '@zerospin/logger';
import { Effect, Result, Schema } from 'effect';
import { system } from 'system';

import { FrontendServiceChain } from '../../FrontendServiceChain/FrontendServiceChain.js';

/*
 * ServiceFrontendApi serves reconnect history from FrontendServiceChain.
 * The capability binds the frontend identity; the request supplies the replay
 * cursor.
 *
 * 1. Validate the replay request.
 * 2. Return invalid replay arguments.
 * 3. Resolve the retained frontend log.
 * 4. Read and settle the retained suffix.
 * 5. Return the replay result.
 */
export const getFinalizedCommands = Effect.fn(
  'ServiceFrontendApi.getFinalizedCommands',
)(function* (props: {
  request: IRpcRequest<[{ afterServiceIndex: number; serviceVersion: string }]>;
  authResults: {
    readonly userId: string;
    readonly frontendName: string;
    readonly serviceFrontendLock: Schema.Schema.Type<
      typeof ServiceFrontendLockSchema
    >;
    readonly serviceName: string;
    serviceVersion: string;
    readonly systemId: ISystemId;
  };
}) {
  const { authResults, request } = props;

  // 1 — require an integer, nonnegative afterServiceIndex
  const validated = yield* Schema.decodeUnknownEffect(
    Schema.toType(
      Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            serviceVersion: Schema.String,
            afterServiceIndex: Schema.Number.check(
              Schema.isInt(),
              Schema.isGreaterThanOrEqualTo(0),
            ),
          }),
        ]),
      ),
    ),
  )(request.args, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'service-frontend-api-arguments-invalid',
      prefix:
        'ServiceFrontendApi.getFinalizedCommands received invalid arguments',
    }),
    Effect.result,
  );

  // 2 — encode the argument failure with a null link
  if (Result.isFailure(validated)) {
    return {
      result: yield* encodeRpc(Effect.fail(validated.failure)),
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
      result: yield* encodeRpc(
        Effect.fail(
          new ZerospinError({
            code: 'service-version-unavailable',
            message:
              'The requested version is not available through this capability',
          }),
        ),
      ),
      link: null,
    };
  }

  // 3 — use the capability-bound frontend fields
  const chain = yield* FrontendServiceChain.getRepo({
    key: {
      systemId: authResults.systemId,
      serviceName: authResults.serviceName,
      serviceVersion: validated.success[0].serviceVersion,
      userId: authResults.userId,
      frontendName: authResults.frontendName,
    },
  });

  // 4 — decode chain.getCommands after the requested cursor
  const settled = yield* makeAsync<
    IEncodedResult<
      Readonly<{
        commands: readonly IEncodedCommand<IServiceFrontendFinalizedCommand>[];
        tip: number;
      }>,
      IAnyErrorJson
    >
  >(() =>
    chain.getCommands({
      afterServiceIndex: validated.success[0].afterServiceIndex,
    }),
  ).pipe(Effect.flatMap(decodeRpc), Effect.result);

  // 5 — encode the commands/tip or failure without emitting a trace link
  return {
    result: yield* Result.match(settled, {
      onFailure: error => encodeRpc(Effect.fail(error)),
      onSuccess: value => encodeRpc(Effect.succeed(value)),
    }),
    link: null,
  };
});
