import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IEncodedCommand } from '@zerospin/core/contracts/types';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IServiceFrontendFinalizedCommand } from '@zerospin/core/serviceSession/types';
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

import { getServiceFrontendFinalizedCommandChain } from '../../ServiceFrontendFinalizedCommandChain/getServiceFrontendFinalizedCommandChain/getServiceFrontendFinalizedCommandChain.js';

export const getFinalizedCommands = Effect.fn(
  'ServiceFrontendApi.getFinalizedCommands',
)(function* (props: {
  request: IRpcRequest<[{ afterServiceFrontendIndex: number }]>;
  authResults: {
    readonly userId: string;
    readonly frontendName: string;
    readonly serviceFrontendLock: Schema.Schema.Type<
      typeof ServiceFrontendLockSchema
    >;
    readonly serviceName: string;
    readonly systemId: ISystemId;
  };
}) {
  const { authResults, request } = props;
  const validated = yield* Schema.decodeUnknownEffect(
    Schema.toType(
      Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            afterServiceFrontendIndex: Schema.Number.check(
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
  if (Result.isFailure(validated)) {
    return {
      result: yield* encodeRpc(Effect.fail(validated.failure)),
      link: null,
    };
  }

  const chain = yield* getServiceFrontendFinalizedCommandChain({
    key: {
      systemId: authResults.systemId,
      serviceName: authResults.serviceName,
      userId: authResults.userId,
      frontendName: authResults.frontendName,
    },
  });
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
      afterServiceFrontendIndex:
        validated.success[0].afterServiceFrontendIndex,
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
