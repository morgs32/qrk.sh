import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { mapParseError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';

import { authorizeServiceFrontend } from '../../authorizeServiceFrontend/authorizeServiceFrontend.js';
import { checkServiceAuthorization } from '../../GatewayApi/checkServiceAuthorization/checkServiceAuthorization.js';
import type { ISystemRuntime } from '../../makeSystemRuntime.js';
import { ServiceFrontendApi } from '../../ServiceFrontendApi/ServiceFrontendApi.js';
import { ServiceFrontendApiFailure } from '../../ServiceFrontendApi/ServiceFrontendApiFailure/ServiceFrontendApiFailure.js';

export const authorize = Effect.fn('ServiceAccessApi.authorize')(
  function* (props: {
    request: {
      frontendName: string;
      serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
    };
    access: {
      systemName: string;
      serviceName: string;
      serviceVersion: string;
      authenticated: {
        authentication: Readonly<Record<string, unknown>>;
        selectionPath: string;
      };
    };
    runtime: ISystemRuntime;
  }) {
    const { request, access, runtime } = props;
    const { authenticated } = access;
    return yield* Effect.gen(function* () {
      const validated = yield* Schema.decodeUnknownEffect(
        Schema.Struct({
          frontendName: Schema.String,
          serviceFrontendLock: Schema.Unknown,
        }),
      )(request, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'service-authorization-arguments-invalid',
          prefix: 'Invalid service authorization arguments',
        }),
      );
      const serviceFrontendLock = yield* Schema.decodeUnknownEffect(
        ServiceFrontendLockSchema,
      )(validated.serviceFrontendLock, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'service-frontend-lock-invalid',
          prefix: 'Invalid service frontend lock',
        }),
      );
      const authentication = authenticated.authentication;

      const authorization = yield* authorizeServiceFrontend({
        serviceVersion: access.serviceVersion,
        serviceName: access.serviceName,
        frontendName: validated.frontendName,
        serviceFrontendLock,
        authentication,
      });
      yield* checkServiceAuthorization({
        serviceVersion: access.serviceVersion,
        authorization,
        authentication,
        systemName: access.systemName,
        serviceName: access.serviceName,
        frontendName: validated.frontendName,
        serviceFrontendLock,
      });

      return new ServiceFrontendApi({
        authResults: {
          serviceVersion: access.serviceVersion,
          frontendName: validated.frontendName,
          serviceFrontendLock: authorization.serviceFrontendLock,
          serviceName: access.serviceName,
          systemId: env.ZEROSPIN_SYSTEM_ID,
          authentication,
          selectionPath: authenticated.selectionPath,
        },
        runtime,
      });
    }).pipe(
      Effect.catch(error =>
        Effect.succeed(new ServiceFrontendApiFailure(error)),
      ),
    );
  },
);
