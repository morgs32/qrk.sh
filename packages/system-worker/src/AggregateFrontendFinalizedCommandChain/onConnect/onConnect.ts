import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { Effect, Result, Schema } from 'effect';
import type { Connection } from 'partyserver';

export const onConnect = Effect.fn('AggregateFrontendFinalizedCommandChain.onConnect')(
  function* (props: {
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      aggregateId: string;
      aggregateName: string;
      userId: string;
      frontendName: string;
      aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
    }>;
    request: Request;
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      userId: string;
      frontendName: string;
    };
  }) {
    const { connection, key, request } = props;
    yield* Effect.void;

    const aggregateId = request.headers.get('x-zerospin-aggregate-id');
    const aggregateName = request.headers.get('x-zerospin-aggregate-name');
    const userId = request.headers.get('x-zerospin-user-id');
    const frontendName = request.headers.get('x-zerospin-frontend-name');
    const encodedAggregateFrontendLock = request.headers.get(
      'x-zerospin-aggregate-frontend-lock',
    );
    if (
      aggregateId !== key.aggregateId ||
      aggregateName !== key.aggregateName ||
      userId !== key.userId ||
      frontendName !== key.frontendName ||
      encodedAggregateFrontendLock === null
    ) {
      connection.close(4004, 'aggregate-frontend-target-invalid');
      return;
    }
    const aggregateFrontendLockResult = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(AggregateFrontendLockSchema),
    )(encodedAggregateFrontendLock, {
      onExcessProperty: 'error',
    }).pipe(Effect.result);
    if (Result.isFailure(aggregateFrontendLockResult)) {
      connection.close(4004, 'aggregate-frontend-lock-invalid');
      return;
    }
    connection.setState({
      phase: 'awaiting-resume',
      aggregateId,
      aggregateName,
      userId,
      frontendName,
      aggregateFrontendLock: aggregateFrontendLockResult.success,
    });
  },
);
