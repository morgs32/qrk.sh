import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';

import { AggregateFrontendApi } from '../../AggregateFrontendApi/AggregateFrontendApi.js';
import { AggregateFrontendApiFailure } from '../../AggregateFrontendApi/AggregateFrontendApiFailure/AggregateFrontendApiFailure.js';
import { authorizeAggregateFrontend } from '../../authorizeAggregateFrontend/authorizeAggregateFrontend.js';
import { checkAggregateAuthorization } from '../../GatewayApi/checkAggregateAuthorization/checkAggregateAuthorization.js';
import type { ISystemRuntime } from '../../makeSystemRuntime.js';

export const authorize = Effect.fn('AggregateAccessApi.authorize')(
  function* (props: {
    request: {
      frontendName: string;
      aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
    };
    access: {
      systemName: string;
      aggregateName: string;
      aggregateVersion: string;
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
          aggregateFrontendLock: Schema.Unknown,
        }),
      )(request, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'aggregate-authorization-arguments-invalid',
          prefix: 'Invalid aggregate authorization arguments',
        }),
      );
      const aggregateFrontendLock = yield* Schema.decodeUnknownEffect(
        AggregateFrontendLockSchema,
      )(validated.aggregateFrontendLock, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'aggregate-frontend-lock-invalid',
          prefix: 'Invalid aggregate frontend lock',
        }),
      );
      const authentication = authenticated.authentication;
      const aggregateId = yield* Schema.decodeUnknownEffect(
        makeAbbreviationIdSchema(coreAbbreviations.aggregate),
      )(authentication.aggregateId).pipe(
        mapParseError({
          code: 'authentication-aggregate-id-invalid',
          prefix: 'Invalid authenticated aggregate ID',
        }),
      );

      const authorization = yield* authorizeAggregateFrontend({
        aggregateVersion: access.aggregateVersion,
        aggregateId,
        aggregateName: access.aggregateName,
        frontendName: validated.frontendName,
        aggregateFrontendLock,
        authentication,
      });
      yield* checkAggregateAuthorization({
        aggregateVersion: access.aggregateVersion,
        authorization,
        authentication,
        aggregateId,
        aggregateName: access.aggregateName,
        systemName: access.systemName,
        frontendName: validated.frontendName,
        aggregateFrontendLock,
      });

      return new AggregateFrontendApi({
        authResults: {
          aggregateVersion: access.aggregateVersion,
          aggregateId: authorization.aggregateId,
          aggregateName: authorization.aggregateName,
          authentication: authorization.authentication,
          selectionPath: authenticated.selectionPath,
          aggregateFrontendLock: authorization.aggregateFrontendLock,
          frontendName: validated.frontendName,
          systemId: env.ZEROSPIN_SYSTEM_ID,
        },
        runtime,
      });
    }).pipe(
      Effect.catch(error =>
        Effect.succeed(new AggregateFrontendApiFailure(error)),
      ),
    );
  },
);
