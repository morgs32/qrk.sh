import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IEncodedCommand } from '@zerospin/core/contracts/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { IAggregateFrontendPushedCommand } from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  mapParseError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import type { IRpcRequest } from '@zerospin/logger';
import { Effect, Result, Schema } from 'effect';

import { getAggregateFrontendPushedCommandChain } from '../../AggregateFrontendPushedCommandChain/getAggregateFrontendPushedCommandChain/getAggregateFrontendPushedCommandChain.js';

export const getPushedCommands = Effect.fn(
  'AggregateFrontendApi.getPushedCommands',
)(function* (props: {
  request: IRpcRequest<[{ afterPushIndex: number }]>;
  authResults: {
    readonly aggregateId: IAggregateId;
    readonly aggregateName: string;
    readonly userId: string;
    readonly frontendName: string;
    readonly aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    readonly systemId: ISystemId;
  };
}) {
  const { authResults, request } = props;
  const validated = yield* Schema.decodeUnknownEffect(
    Schema.toType(
      Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            afterPushIndex: Schema.Number.check(
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
        'AggregateFrontendApi.getPushedCommands received invalid arguments',
    }),
    Effect.result,
  );
  if (Result.isFailure(validated)) {
    return {
      result: yield* encodeRpc(Effect.fail(validated.failure)),
      link: null,
    };
  }

  const chain = yield* getAggregateFrontendPushedCommandChain({
    key: {
      systemId: authResults.systemId,
      aggregateId: authResults.aggregateId,
      aggregateName: authResults.aggregateName,
      userId: authResults.userId,
      frontendName: authResults.frontendName,
    },
  });
  const settled = yield* makeAsync<
    IEncodedResult<
      Readonly<{
        commands: readonly IEncodedCommand<IAggregateFrontendPushedCommand>[];
        tip: number;
      }>,
      IAnyErrorJson
    >
  >(() =>
    chain.getCommands({
      afterPushIndex: validated.success[0].afterPushIndex,
    }),
  ).pipe(Effect.flatMap(decodeRpc), Effect.result);
  return {
    result: yield* Result.match(settled, {
      onFailure: error => encodeRpc(Effect.fail(error)),
      onSuccess: value => encodeRpc(Effect.succeed(value)),
    }),
    link: null,
  };
});
