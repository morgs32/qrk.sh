import type { IUserRef } from '@zerospin/core/aggregate/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { Effect, type Schema } from 'effect';

export const getAdmission = Effect.fn('AggregateFrontendApi.getAdmission')(
  (props: {
    admission: {
      readonly actorRef: IUserRef;
      readonly aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
      readonly frontendName: string;
      readonly frontendSpec: IFrontendControllerSpec;
      readonly systemId: ISystemId;
      readonly systemVersion: string;
    };
  }) =>
    encodeRpc(
      Effect.succeed({
        actorRef: props.admission.actorRef,
        aggregateFrontendLock: props.admission.aggregateFrontendLock,
        frontendName: props.admission.frontendName,
        frontendSpec: props.admission.frontendSpec,
        systemId: props.admission.systemId,
        systemVersion: props.admission.systemVersion,
      }),
    ),
);
