import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { AggregateFrontendFinalizedCommandChain } from '../AggregateFrontendFinalizedCommandChain/AggregateFrontendFinalizedCommandChain.js';
import { MaterializedAggregateFrontendRepo } from '../MaterializedAggregateFrontendRepo/MaterializedAggregateFrontendRepo.js';
import { SelectedAggregateFrontendLockSchema } from '../StaticSystem/frontendSpecSchemas.js';
import { validateAggregateFrontendLock } from '../StaticSystem/validateAggregateFrontendLock/validateAggregateFrontendLock.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const createAggregateFrontendWebSocketTicket = Effect.fn(
  'SystemWorker.createAggregateFrontendWebSocketTicket',
  { root: true },
)(function* (props: {
  aggregateId: IAggregateId;
  aggregateName: string;
  userId: string;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
  configuredSystemId: string;
}) {
  const {
    aggregateFrontendLock,
    aggregateId,
    aggregateName,
    configuredSystemId,
    frontendName,
    userId,
  } = props;
  const systemId = yield* Schema.decodeUnknownEffect(
    makeAbbreviationIdSchema(coreAbbreviations.system),
  )(configuredSystemId).pipe(
    mapParseError({
      code: 'aggregate-frontend-websocket-ticket-system-id-invalid',
      prefix: 'Failed to decode aggregate frontend ticket systemId',
    }),
  );
  const selectedUnknown = yield* validateAggregateFrontendLock({
    aggregateName: aggregateName,
    frontendName: frontendName,
    aggregateFrontendLock: aggregateFrontendLock,
  });
  const selected = yield* Schema.decodeUnknownEffect(
    SelectedAggregateFrontendLockSchema,
  )(selectedUnknown, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-runtime-aggregate-frontend-lock-invalid',
      prefix:
        'The static System returned an invalid selected aggregate frontend lock',
    }),
  );

  const key = {
    systemId,
    aggregateId,
    aggregateName: aggregateName,
    userId,
    frontendName: frontendName,
  };
  const repoName =
    yield* AggregateFrontendFinalizedCommandChain.fixedDORepoConfig.nameUtils.makeName(
      key,
    );
  const materializedAggregateFrontendRepoName =
    yield* MaterializedAggregateFrontendRepo.fixedDORepoConfig.nameUtils.makeName(
      key,
    );
  const systemRepo = SystemRepo.getRepo({
    systemId,
  });
  const aggregateFrontendRegistrations = yield* makeAsync(() =>
    systemRepo.getRepoRegistrations({
      repoType: 'MaterializedAggregateFrontendRepo',
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  if (
    !aggregateFrontendRegistrations.some(
      registration =>
        registration.repoName === materializedAggregateFrontendRepoName,
    )
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-state-required',
      message:
        'Frontend state must initialize before a WebSocket ticket can be created',
      extra: {
        aggregateId,
        userId,
        frontendName: frontendName,
      },
    });
  }

  const ticket = yield* makeAsync(() =>
    systemRepo.createAggregateFrontendWebSocketTicket({
      repoName,
      aggregateId,
      aggregateName: aggregateName,
      userId,
      frontendName: frontendName,
      aggregateFrontendLock: selected.aggregateFrontendLock,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  return { ticket };
});
