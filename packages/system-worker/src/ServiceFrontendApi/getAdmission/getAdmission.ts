import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { Effect, type Schema } from 'effect';

export const getAdmission = Effect.fn('ServiceFrontendApi.getAdmission')(
  (props: {
    admission: {
      readonly userId: string;
      readonly serviceName: string;
      readonly frontendName: string;
      readonly serviceFrontendLock: Schema.Schema.Type<
        typeof ServiceFrontendLockSchema
      >;
      readonly frontendSpec: IFrontendControllerSpec;
      readonly systemId: ISystemId;
      readonly systemVersion: string;
    };
  }) =>
    encodeRpc(
      Effect.succeed({
        userId: props.admission.userId,
        serviceName: props.admission.serviceName,
        frontendName: props.admission.frontendName,
        serviceFrontendLock: props.admission.serviceFrontendLock,
        frontendSpec: props.admission.frontendSpec,
        systemId: props.admission.systemId,
        systemVersion: props.admission.systemVersion,
      }),
    ),
);
