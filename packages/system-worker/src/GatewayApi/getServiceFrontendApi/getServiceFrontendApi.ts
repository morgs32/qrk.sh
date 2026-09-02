import { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { mapParseError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';

import { authenticate } from '../../authenticate/authenticate.js';
import { authorizeServiceFrontend } from '../../authorizeServiceFrontend/authorizeServiceFrontend.js';
import type { ISystemRuntime } from '../../makeSystemRuntime.js';
import { ServiceFrontendApi } from '../../ServiceFrontendApi/ServiceFrontendApi.js';
import { ServiceFrontendApiFailure } from '../../ServiceFrontendApi/ServiceFrontendApiFailure/ServiceFrontendApiFailure.js';
import { checkAuthentication } from '../checkAuthentication/checkAuthentication.js';
import { checkAuthorization } from '../checkAuthorization/checkAuthorization.js';
import { checkPublishableApiKey } from '../checkPublishableApiKey/checkPublishableApiKey.js';

export const getServiceFrontendApi = Effect.fn(
  'GatewayApi.getServiceFrontendApi',
  { root: true },
)(function* (props: {
  request: {
    publishableKey: string;
    systemName: string;
    authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
    signature: unknown;
    serviceName: string;
    frontendName: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  };
  runtime: ISystemRuntime;
}) {
  const { request, runtime } = props;
  return yield* Effect.gen(function* () {
    const validated = yield* Schema.decodeUnknownEffect(
      Schema.toType(
        Schema.Struct({
          publishableKey: Schema.String,
          systemName: Schema.String,
          authenticationLock: Schema.Unknown,
          signature: Schema.Unknown,
          serviceName: Schema.String,
          frontendName: Schema.String,
          serviceFrontendLock: Schema.Unknown,
        }),
      ),
    )(request, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'failed-to-decode-get-service-frontend-api-props',
        prefix: 'Failed to decode getServiceFrontendApi arguments',
      }),
    );
    const authenticationLock = yield* Schema.decodeUnknownEffect(
      AuthenticationLockSchema,
    )(validated.authenticationLock, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'authentication-lock-invalid',
        prefix: 'getServiceFrontendApi received an invalid authentication lock',
      }),
    );
    const serviceFrontendLock = yield* Schema.decodeUnknownEffect(
      ServiceFrontendLockSchema,
    )(validated.serviceFrontendLock, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'service-frontend-lock-invalid',
        prefix:
          'getServiceFrontendApi received an invalid service frontend lock',
      }),
    );
    yield* checkPublishableApiKey(validated.publishableKey);
    const authentication = yield* authenticate({
      authenticationLock,
      signature: validated.signature,
    });
    const userId = yield* checkAuthentication({
      authentication,
      authenticationLock,
      systemName: validated.systemName,
    });
    const authorization = yield* authorizeServiceFrontend({
      serviceName: validated.serviceName,
      frontendName: validated.frontendName,
      serviceFrontendLock,
      userId,
    });
    yield* checkAuthorization({
      kind: 'service',
      authorization,
      userId,
      systemName: validated.systemName,
      serviceName: validated.serviceName,
      frontendName: validated.frontendName,
      serviceFrontendLock,
    });
    return new ServiceFrontendApi({
      authResults: {
        frontendName: validated.frontendName,
        serviceFrontendLock: authorization.serviceFrontendLock,
        serviceName: validated.serviceName,
        systemId: env.ZEROSPIN_SYSTEM_ID,
        userId,
      },
      runtime,
    });
  }).pipe(
    Effect.catch(error => Effect.succeed(new ServiceFrontendApiFailure(error))),
  );
});
