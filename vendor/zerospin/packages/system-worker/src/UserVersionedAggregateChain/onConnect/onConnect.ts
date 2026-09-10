import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { Effect, Result, Schema } from 'effect';
import type { Connection } from 'partyserver';

/*
 * The aggregate frontend log accepts SystemRepo-forwarded upgrade context.
 * It compares the forwarded target with its bound key and initializes a
 * connection awaiting the client resume cursor.
 *
 * 1. Read the forwarded admission headers.
 * 2. Check the forwarded target against this log.
 * 3. Decode the forwarded frontend lock.
 * 4. Reject an invalid lock.
 * 5. Retain admission while awaiting resume.
 */
export const onConnect = Effect.fn('UserVersionedAggregateChain.onConnect')(
  function* (props: {
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
      userId: string;
      frontendName: string;
      aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
    }>;
    request: Request;
    key: {
      aggregateVersion: string;
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      userId: string;
    };
  }) {
    const { connection, key, request } = props;
    yield* Effect.void;

    // 1 — extract owner, userId, frontendName, and the encoded frontend lock
    const aggregateId = request.headers.get('x-zerospin-aggregate-id');
    const aggregateName = request.headers.get('x-zerospin-aggregate-name');
    const aggregateVersion = request.headers.get(
      'x-zerospin-aggregate-version',
    );
    const userId = request.headers.get('x-zerospin-user-id');
    const frontendName = request.headers.get('x-zerospin-frontend-name');
    const encodedAggregateFrontendLock = request.headers.get(
      'x-zerospin-aggregate-frontend-lock',
    );

    // 2 — close with 4004 when target fields differ or the lock is absent
    if (
      aggregateId !== key.aggregateId ||
      aggregateName !== key.aggregateName ||
      aggregateVersion !== key.aggregateVersion ||
      userId !== key.userId ||
      frontendName === null ||
      encodedAggregateFrontendLock === null
    ) {
      connection.close(4004, 'aggregate-frontend-target-invalid');
      return;
    }

    // 3 — reject excess fields while decoding AggregateFrontendLockSchema
    const aggregateFrontendLockResult = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(AggregateFrontendLockSchema),
    )(encodedAggregateFrontendLock, {
      onExcessProperty: 'error',
    }).pipe(Effect.result);

    // 4 — close with 4004 before installing connection state
    if (Result.isFailure(aggregateFrontendLockResult)) {
      connection.close(4004, 'aggregate-frontend-lock-invalid');
      return;
    }

    // 5 — store phase awaiting-resume and the checked header fields
    connection.setState({
      phase: 'awaiting-resume',
      aggregateVersion,
      aggregateId,
      aggregateName,
      userId,
      frontendName,
      aggregateFrontendLock: aggregateFrontendLockResult.success,
    });
  },
);
