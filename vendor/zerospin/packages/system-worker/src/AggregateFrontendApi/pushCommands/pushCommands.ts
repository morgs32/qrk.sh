import type { IUserRef } from '@zerospin/core/aggregate/types';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { StagedReplicaCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IEncodedCommand,
  IStagedReplicaCommand,
} from '@zerospin/core/contracts/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { mapParseError } from '@zerospin/error';
import type { IRpcRequest } from '@zerospin/logger';
import { Effect, Either, Schema } from 'effect';

import { SystemRepo } from '../../SystemRepo/SystemRepo.js';

export const pushCommands = Effect.fn('AggregateFrontendApi.pushCommands')(
  function* (props: {
    request: IRpcRequest<
      [{ readonly commands: readonly IEncodedCommand<IStagedReplicaCommand>[] }]
    >;
    authResults: {
      readonly actorRef: IUserRef;
      readonly frontendName: string;
      readonly aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
      readonly systemId: ISystemId;
    };
  }) {
    const validatedArgs = yield* Schema.validate(
      Schema.mutable(
        Schema.Tuple(
          Schema.Struct({ commands: Schema.Array(StagedReplicaCommandSchema) }),
        ),
      ),
    )(props.request.args, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'aggregate-frontend-api-arguments-invalid',
        prefix: 'AggregateFrontendApi.pushCommands received invalid arguments',
      }),
      Effect.either,
    );
    if (Either.isLeft(validatedArgs)) {
      return {
        result: yield* encodeRpc(Effect.fail(validatedArgs.left)),
        link: null,
      };
    }

    const systemRepo = SystemRepo.getRepo({
      systemId: props.authResults.systemId,
    });
    const settled = yield* makeAsync(() =>
      systemRepo.pushCommands({
        actorRef: props.authResults.actorRef,
        aggregateFrontendLock: props.authResults.aggregateFrontendLock,
        commands: validatedArgs.right[0].commands,
        frontendName: props.authResults.frontendName,
      }),
    ).pipe(
      Effect.flatMap(decodeRpc),
      Effect.withSpan('AggregateFrontendApi.pushCommands', { root: true }),
      Effect.either,
    );
    const result = yield* Either.match(settled, {
      onLeft: error => encodeRpc(Effect.fail(error)),
      onRight: value => encodeRpc(Effect.succeed(value)),
    });

    return { result, link: null };
  },
);
