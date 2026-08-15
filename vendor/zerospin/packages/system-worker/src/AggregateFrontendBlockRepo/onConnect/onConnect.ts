import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { Effect, Either, Schema } from 'effect';
import type { Connection } from 'partyserver';

export const onConnect = Effect.fn('AggregateFrontendBlockRepo.onConnect')(
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
      generationId: string;
      aggregateId: string;
      aggregateName: string;
      userId: string;
      frontendName: string;
    };
  }) {
    yield* Effect.void;

    const aggregateId = props.request.headers.get('x-zerospin-aggregate-id');
    const aggregateName = props.request.headers.get(
      'x-zerospin-aggregate-name',
    );
    const userId = props.request.headers.get('x-zerospin-user-id');
    const frontendName = props.request.headers.get('x-zerospin-frontend-name');
    const encodedAggregateFrontendLock = props.request.headers.get(
      'x-zerospin-aggregate-frontend-lock',
    );
    if (
      aggregateId !== props.key.aggregateId ||
      aggregateName !== props.key.aggregateName ||
      userId !== props.key.userId ||
      frontendName !== props.key.frontendName ||
      encodedAggregateFrontendLock === null
    ) {
      props.connection.close(4004, 'aggregate-frontend-target-invalid');
      return;
    }
    const aggregateFrontendLockResult = yield* Schema.decodeUnknown(
      Schema.parseJson(AggregateFrontendLockSchema),
    )(encodedAggregateFrontendLock, {
      onExcessProperty: 'error',
    }).pipe(Effect.either);
    if (Either.isLeft(aggregateFrontendLockResult)) {
      props.connection.close(4004, 'aggregate-frontend-lock-invalid');
      return;
    }
    props.connection.setState({
      phase: 'awaiting-resume',
      aggregateId,
      aggregateName,
      userId,
      frontendName,
      aggregateFrontendLock: aggregateFrontendLockResult.right,
    });
  },
);
