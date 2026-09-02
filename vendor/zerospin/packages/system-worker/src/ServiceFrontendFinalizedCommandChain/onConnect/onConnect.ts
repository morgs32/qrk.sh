import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { Effect, Result, Schema } from 'effect';
import type { Connection } from 'partyserver';

export const onConnect = Effect.fn('ServiceFrontendFinalizedCommandChain.onConnect')(
  function* (props: {
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      serviceName: string;
      userId: string;
      frontendName: string;
      serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
    }>;
    request: Request;
    key: {
      systemId: string;
      serviceName: string;
      userId: string;
      frontendName: string;
    };
  }) {
    const { connection, key, request } = props;
    yield* Effect.void;

    const serviceName = request.headers.get('x-zerospin-service-name');
    const userId = request.headers.get('x-zerospin-user-id');
    const frontendName = request.headers.get('x-zerospin-frontend-name');
    const encodedServiceFrontendLock = request.headers.get(
      'x-zerospin-service-frontend-lock',
    );
    if (
      serviceName !== key.serviceName ||
      userId !== key.userId ||
      frontendName !== key.frontendName ||
      encodedServiceFrontendLock === null
    ) {
      connection.close(4004, 'service-frontend-target-invalid');
      return;
    }
    const serviceFrontendLockResult = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ServiceFrontendLockSchema),
    )(encodedServiceFrontendLock, {
      onExcessProperty: 'error',
    }).pipe(Effect.result);
    if (Result.isFailure(serviceFrontendLockResult)) {
      connection.close(4004, 'service-frontend-lock-invalid');
      return;
    }
    connection.setState({
      phase: 'awaiting-resume',
      serviceName,
      userId,
      frontendName,
      serviceFrontendLock: serviceFrontendLockResult.success,
    });
  },
);
