import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { Effect, Either, Schema } from 'effect';
import type { Connection } from 'partyserver';

export const onConnect = Effect.fn('ServiceFrontendBlockRepo.onConnect')(
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
      generationId: string;
      serviceName: string;
      userId: string;
      frontendName: string;
    };
  }) {
    yield* Effect.void;

    const serviceName = props.request.headers.get('x-zerospin-service-name');
    const userId = props.request.headers.get('x-zerospin-user-id');
    const frontendName = props.request.headers.get('x-zerospin-frontend-name');
    const encodedServiceFrontendLock = props.request.headers.get(
      'x-zerospin-service-frontend-lock',
    );
    if (
      serviceName !== props.key.serviceName ||
      userId !== props.key.userId ||
      frontendName !== props.key.frontendName ||
      encodedServiceFrontendLock === null
    ) {
      props.connection.close(4004, 'service-frontend-target-invalid');
      return;
    }
    const serviceFrontendLockResult = yield* Schema.decodeUnknown(
      Schema.parseJson(ServiceFrontendLockSchema),
    )(encodedServiceFrontendLock, {
      onExcessProperty: 'error',
    }).pipe(Effect.either);
    if (Either.isLeft(serviceFrontendLockResult)) {
      props.connection.close(4004, 'service-frontend-lock-invalid');
      return;
    }
    props.connection.setState({
      phase: 'awaiting-resume',
      serviceName,
      userId,
      frontendName,
      serviceFrontendLock: serviceFrontendLockResult.right,
    });
  },
);
