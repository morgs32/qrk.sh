import {
  AggregateSessionLockSchema,
  type IAggregateSessionLock,
} from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { ISystem } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';

import { AggregateSessionApi } from '../../AggregateSessionApi/AggregateSessionApi.js';
import { AggregateSessionApiFailure } from '../../AggregateSessionApi/AggregateSessionApiFailure/AggregateSessionApiFailure.js';

import { authorizeAggregateSession } from './authorizeAggregateSession/authorizeAggregateSession.js';
import { checkAggregateAuthorization } from './checkAggregateAuthorization/checkAggregateAuthorization.js';

export const authorize = Effect.fn('AggregateAccessApi.authorize')(
  function* (props: {
    request: {
      sessionName: string;
      aggregateSessionLock: IAggregateSessionLock;
    };
    access: {
      systemName: string;
      aggregateName: string;
      aggregateVersion: string;
      admitted: {
        identity: Readonly<Record<string, unknown>>;
        actorName: string;
        actorVersion: string;
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
          aggregateSessionLock: Schema.Unknown,
        }),
      )(request, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'aggregate-authorization-arguments-invalid',
          prefix: 'Invalid aggregate authorization arguments',
        }),
      );
      const aggregateSessionLock = yield* Schema.decodeUnknownEffect(
        AggregateSessionLockSchema,
      )(validated.aggregateSessionLock, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'aggregate-session-lock-invalid',
          prefix: 'Invalid aggregate definition lock',
        }),
      );
      if (
        aggregateSessionLock.actorName !== admitted.actorName ||
        aggregateSessionLock.actorVersion !== admitted.actorVersion
      ) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'actor-capability-mismatch',
            message: 'Session lock differs from the admitted selection',
          }),
        );
      }
      const identity = admitted.identity;
      const aggregateId = yield* Schema.decodeUnknownEffect(
        makeAbbreviationIdSchema(coreAbbreviations.aggregate),
      )(identity.aggregateId).pipe(
        mapParseError({
          code: 'identity-aggregate-id-invalid',
          prefix: 'Invalid admitted aggregate ID',
        }),
      );

      const authorization = yield* authorizeAggregateSession({
        aggregateVersion: access.aggregateVersion,
        aggregateId,
        aggregateName: access.aggregateName,
        sessionName: validated.sessionName,
        aggregateSessionLock,
        identity,
      });
      yield* checkAggregateAuthorization({
        aggregateVersion: access.aggregateVersion,
        authorization,
        identity,
        aggregateId,
        aggregateName: access.aggregateName,
        sessionName: validated.sessionName,
        aggregateSessionLock,
      });

      return new AggregateSessionApi({
        authResults: {
          aggregateVersion: access.aggregateVersion,
          aggregateId: authorization.aggregateId,
          aggregateName: authorization.aggregateName,
          identity: authorization.identity,
          actorName: admitted.actorName,
          actorVersion: admitted.actorVersion,
          actorPath: admitted.actorPath,
          aggregateSessionLock: authorization.aggregateSessionLock,
          sessionName: validated.sessionName,
          systemId: env.ZEROSPIN_SYSTEM_ID,
        },
        runtime,
      });
    }).pipe(
      Effect.catch(error =>
        Effect.succeed(new AggregateSessionApiFailure(error)),
      ),
    );
  },
);
