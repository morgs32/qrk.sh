import type { IUserRef } from '@zerospin/core/aggregate/types';
import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IAggregateId } from '@zerospin/core/models/types';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, type IAnyError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { getAggregateRepo } from '../AggregateRepo/getAggregateRepo/getAggregateRepo.js';
import { SelectedAggregateFrontendLockSchema } from '../StaticSystem/frontendSpecSchemas.js';
import { validateAggregateFrontendLock } from '../StaticSystem/validateAggregateFrontendLock/validateAggregateFrontendLock.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const authorizeAggregateFrontend = Effect.fn(
  'SystemWorker.authorizeAggregateFrontend',
  { root: true },
)(function* (props: {
  generationId: string;
  userId: string;
  aggregateId: IAggregateId;
  aggregateName: string;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
}): Effect.fn.Return<
  Readonly<{
    actorRef: IUserRef;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    frontendSpec: IFrontendControllerSpec;
    systemVersion: string;
  }>,
  IAnyError,
  Async
> {
  const aggregateId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.aggregate),
  )(props.aggregateId).pipe(
    mapParseError({
      code: 'aggregate-frontend-authorization-aggregate-id-invalid',
      prefix: 'Failed to decode frontend authorization aggregateId',
    }),
  );
  const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
    props.userId,
  ).pipe(
    mapParseError({
      code: 'aggregate-frontend-authorization-user-id-invalid',
      prefix: 'Failed to decode frontend authorization userId',
    }),
  );
  const systemSpec = makeSystemSpec({ system });
  const selectedUnknown = yield* validateAggregateFrontendLock({
    aggregateName: props.aggregateName,
    frontendName: props.frontendName,
    aggregateFrontendLock: props.aggregateFrontendLock,
  });
  const selected = yield* Schema.decodeUnknown(
    SelectedAggregateFrontendLockSchema,
  )(selectedUnknown, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-runtime-aggregate-frontend-lock-invalid',
      prefix:
        'The static System returned an invalid selected aggregate frontend lock',
    }),
  );
  yield* makeAsync(() =>
    SystemRepo.getRepo({
      systemId: env.ZEROSPIN_SYSTEM_ID,
    }).assertGenerationAdmission({
      generationId: props.generationId,
      mode: 'read',
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  const aggregateRepo = yield* getAggregateRepo({
    key: {
      generationId: props.generationId,
      aggregateId,
      aggregateName: props.aggregateName,
    },
  });
  yield* makeAsync(() =>
    aggregateRepo.authorizeAggregateFrontend({
      aggregateId,
      aggregateName: props.aggregateName,
      frontendName: props.frontendName,
      userId,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  return {
    actorRef: { aggregateId, aggregateName: props.aggregateName, userId },
    aggregateFrontendLock: selected.aggregateFrontendLock,
    frontendSpec: selected.frontendSpec,
    systemVersion: systemSpec.version,
  };
});
