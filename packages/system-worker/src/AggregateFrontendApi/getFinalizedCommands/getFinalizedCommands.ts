import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { IAggregateFrontendFinalizedCommand } from '@zerospin/core/session/types';
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

import { UserVersionedAggregateChain } from '../../UserVersionedAggregateChain/UserVersionedAggregateChain.js';

/*
 * AggregateFrontendApi serves reconnect history from UserVersionedAggregateChain.
 * The capability binds the frontend identity; the request supplies the replay
 * cursor and aggregateVersion.
 *
 * 1. Validate the replay request.
 * 2. Return invalid replay arguments.
 * 3. Resolve the retained frontend log.
 * 4. Read and settle the retained suffix.
 * 5. Return the replay result.
 */
export const getFinalizedCommands = Effect.fn(
  'AggregateFrontendApi.getFinalizedCommands',
)(function* (props: {
  request: IRpcRequest<[{ afterUserIndex: number; aggregateVersion: string }]>;
  authResults: {
    readonly aggregateId: IAggregateId;
    readonly aggregateName: string;
    aggregateVersion: string;
    readonly userId: string;
    readonly frontendName: string;
    readonly aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    readonly systemId: ISystemId;
  };
}) {
  const { authResults, request } = props;

  // 1 — require an integer, nonnegative afterUserIndex and string aggregateVersion
  const validated = yield* Schema.decodeUnknownEffect(
    Schema.toType(
      Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            aggregateVersion: Schema.String,
            afterUserIndex: Schema.Number.check(
              Schema.isInt(),
              Schema.isGreaterThanOrEqualTo(0),
            ),
          }),
        ]),
      ),
    ),
  )(request.args, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'aggregate-frontend-api-arguments-invalid',
      prefix:
        'AggregateFrontendApi.getFinalizedCommands received invalid arguments',
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
      system.aggregates[authResults.aggregateName] ?? {},
      authResults.aggregateVersion,
    ) ||
    validated.success[0].aggregateVersion !== authResults.aggregateVersion
  ) {
    return {
      result: yield* encodeRpc(
        Effect.fail(
          new ZerospinError({
            code: 'aggregate-version-unavailable',
            message:
              'The requested version is not available through this capability',
          }),
        ),
      ),
      link: null,
    };
  }

  // 3 — use the capability-bound frontend fields and caller-selected version
  const chain = yield* UserVersionedAggregateChain.getRepo({
    key: {
      systemId: authResults.systemId,
      aggregateVersion: validated.success[0].aggregateVersion,
      aggregateId: authResults.aggregateId,
      aggregateName: authResults.aggregateName,
      userId: authResults.userId,
    },
  });

  // 4 — decode chain.getCommands after the requested cursor
  const settled = yield* makeAsync<
    IEncodedResult<
      Readonly<{
        commands: readonly IAggregateFrontendFinalizedCommand[];
        tip: number;
      }>,
      IAnyErrorJson
    >
  >(() =>
    chain.getCommands({
      afterUserIndex: validated.success[0].afterUserIndex,
      frontend: {
        name: authResults.frontendName,
        lock: authResults.aggregateFrontendLock,
      },
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
