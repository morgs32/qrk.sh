import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { Effect, Result, Schema } from 'effect';
import type { Connection } from 'partyserver';

/*
 * The service frontend log accepts SystemRepo-forwarded upgrade context.
 * It compares the forwarded target with its bound key and initializes a
 * connection awaiting the client resume cursor.
 *
 * 1. Read the forwarded admission headers.
 * 2. Check the forwarded target against this log.
 * 3. Decode the forwarded frontend lock.
 * 4. Reject an invalid lock.
 * 5. Retain admission while awaiting resume.
 */
export const onConnect = Effect.fn('FrontendServiceChain.onConnect')(
  function* (props: {
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      serviceName: string;
      serviceVersion: string;
      userId: string;
      frontendName: string;
      serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
    }>;
    request: Request;
    key: {
      systemId: string;
      serviceName: string;
      serviceVersion: string;
      userId: string;
      frontendName: string;
    };
  }) {
    const { connection, key, request } = props;
    yield* Effect.void;

    // 1 — extract owner, userId, frontendName, and the encoded frontend lock
    const serviceVersion = request.headers.get('x-zerospin-service-version');
    const serviceName = request.headers.get('x-zerospin-service-name');
    const userId = request.headers.get('x-zerospin-user-id');
    const frontendName = request.headers.get('x-zerospin-frontend-name');
    const encodedServiceFrontendLock = request.headers.get(
      'x-zerospin-service-frontend-lock',
    );

    // 2 — close with 4004 when target fields differ or the lock is absent
    if (
      serviceVersion !== key.serviceVersion ||
      serviceName !== key.serviceName ||
      userId !== key.userId ||
      frontendName !== key.frontendName ||
      encodedServiceFrontendLock === null
    ) {
      connection.close(4004, 'service-frontend-target-invalid');
      return;
    }

    // 3 — reject excess fields while decoding ServiceFrontendLockSchema
    const serviceFrontendLockResult = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ServiceFrontendLockSchema),
    )(encodedServiceFrontendLock, {
      onExcessProperty: 'error',
    }).pipe(Effect.result);

    // 4 — close with 4004 before installing connection state
    if (Result.isFailure(serviceFrontendLockResult)) {
      connection.close(4004, 'service-frontend-lock-invalid');
      return;
    }

    // 5 — store phase awaiting-resume and the checked header fields
    connection.setState({
      phase: 'awaiting-resume',
      serviceVersion,
      serviceName,
      userId,
      frontendName,
      serviceFrontendLock: serviceFrontendLockResult.success,
    });
  },
);
