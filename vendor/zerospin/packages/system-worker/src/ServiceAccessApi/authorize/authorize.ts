import {
  ServiceSessionLockSchema,
  type IServiceSessionLock,
} from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import type { ISystem } from '@zerospin/core/system/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';

import { ServiceSessionApi } from '../../ServiceSessionApi/ServiceSessionApi.js';
import { ServiceSessionApiFailure } from '../../ServiceSessionApi/ServiceSessionApiFailure/ServiceSessionApiFailure.js';

import { authorizeServiceSession } from './authorizeServiceSession/authorizeServiceSession.js';
import { checkServiceAuthorization } from './checkServiceAuthorization/checkServiceAuthorization.js';

export const authorize = Effect.fn('ServiceAccessApi.authorize')(
  function* (props: {
    request: {
      sessionName: string;
      serviceSessionLock: IServiceSessionLock;
    };
    access: {
      systemName: string;
      serviceName: string;
      serviceVersion: string;
      actorName: string;
      actorVersion: string;
      admitted: {
        claims: Readonly<Record<string, unknown>>;
        actorPath: string;
      };
    };
    runtime: ISystem['runtime'];
  }) {
    const { request, access, runtime } = props;
    const { admitted } = access;
    return yield* Effect.gen(function* () {
      const validated = yield* Schema.decodeUnknownEffect(
        Schema.Struct({
          sessionName: Schema.String,
          serviceSessionLock: Schema.Unknown,
        }),
      )(request, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'service-authorization-arguments-invalid',
          prefix: 'Invalid service authorization arguments',
        }),
      );
      const serviceSessionLock = yield* Schema.decodeUnknownEffect(
        ServiceSessionLockSchema,
      )(validated.serviceSessionLock, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'service-session-lock-invalid',
          prefix: 'Invalid service definition lock',
        }),
      );
      if (
        serviceSessionLock.actorName !== access.actorName ||
        serviceSessionLock.actorVersion !== access.actorVersion
      ) {
        return yield* Effect.fail(
          makeZerospinError({ code: 'service-actor-target-mismatch' }),
        );
      }
      const claims = admitted.claims;

      const authorization = yield* authorizeServiceSession({
        serviceVersion: access.serviceVersion,
        serviceName: access.serviceName,
        sessionName: validated.sessionName,
        serviceSessionLock,
        claims,
      });
      yield* checkServiceAuthorization({
        serviceVersion: access.serviceVersion,
        authorization,
        claims,
        serviceName: access.serviceName,
        sessionName: validated.sessionName,
        serviceSessionLock,
      });

      return new ServiceSessionApi({
        authResults: {
          serviceVersion: access.serviceVersion,
          sessionName: validated.sessionName,
          serviceSessionLock: authorization.serviceSessionLock,
          serviceName: access.serviceName,
          systemId: env.ZEROSPIN_SYSTEM_ID,
          claims,
          actorPath: admitted.actorPath,
        },
        runtime,
      });
    }).pipe(
      Effect.catch(error =>
        Effect.succeed(new ServiceSessionApiFailure(error)),
      ),
    );
  },
);
