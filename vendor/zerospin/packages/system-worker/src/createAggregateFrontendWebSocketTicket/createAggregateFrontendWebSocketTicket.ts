import type { IUserRef } from '@zerospin/core/aggregate/types';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { AggregateFrontendBlockRepo } from '../AggregateFrontendBlockRepo/AggregateFrontendBlockRepo.js';
import { getAggregateFrontendBlockRepo } from '../AggregateFrontendBlockRepo/getAggregateFrontendBlockRepo/getAggregateFrontendBlockRepo.js';
import { AggregateFrontendRepo } from '../AggregateFrontendRepo/AggregateFrontendRepo.js';
import { getAggregateFrontendRepo } from '../AggregateFrontendRepo/getAggregateFrontendRepo/getAggregateFrontendRepo.js';
import { SelectedAggregateFrontendLockSchema } from '../StaticSystem/frontendSpecSchemas.js';
import { validateAggregateFrontendLock } from '../StaticSystem/validateAggregateFrontendLock/validateAggregateFrontendLock.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const createAggregateFrontendWebSocketTicket = Effect.fn(
  'SystemWorker.createAggregateFrontendWebSocketTicket',
  { root: true },
)(function* (props: {
  generationId: string;
  actorRef: IUserRef;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
  configuredSystemId: string;
}) {
  const systemId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.system),
  )(props.configuredSystemId).pipe(
    mapParseError({
      code: 'aggregate-frontend-websocket-ticket-system-id-invalid',
      prefix: 'Failed to decode aggregate frontend ticket systemId',
    }),
  );
  const aggregateId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.aggregate),
  )(props.actorRef.aggregateId).pipe(
    mapParseError({
      code: 'aggregate-frontend-websocket-ticket-aggregate-id-invalid',
      prefix: 'Failed to decode aggregate frontend ticket aggregateId',
    }),
  );
  const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
    props.actorRef.userId,
  ).pipe(
    mapParseError({
      code: 'aggregate-frontend-websocket-ticket-user-id-invalid',
      prefix: 'Failed to decode aggregate frontend ticket userId',
    }),
  );
  const generationId = props.generationId;
  const selectedUnknown = yield* validateAggregateFrontendLock({
    aggregateName: props.actorRef.aggregateName,
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

  const key = {
    generationId,
    aggregateId,
    aggregateName: props.actorRef.aggregateName,
    userId,
    frontendName: props.frontendName,
  };
  const repoName =
    yield* AggregateFrontendBlockRepo.boundDORepoConfig.nameUtils.makeName(key);
  const aggregateFrontendRepoName =
    yield* AggregateFrontendRepo.boundDORepoConfig.nameUtils.makeName(key);
  const systemRepo = SystemRepo.getRepo({
    systemId,
  });
  const aggregateFrontendRegistrations = yield* makeAsync(() =>
    systemRepo.getRepoRegistrations({
      generationId,
      repoType: 'AggregateFrontendRepo',
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  const archiveRegistrations = yield* makeAsync(() =>
    systemRepo.getRepoRegistrations({
      generationId,
      repoType: 'AggregateFrontendBlockRepo',
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  if (
    !aggregateFrontendRegistrations.some(
      registration => registration.repoName === aggregateFrontendRepoName,
    ) ||
    !archiveRegistrations.some(
      registration => registration.repoName === repoName,
    )
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-state-required',
      message:
        'Frontend state must initialize a real local segment before a WebSocket ticket can be created',
      extra: {
        generationId,
        aggregateId,
        userId,
        frontendName: props.frontendName,
      },
    });
  }

  const aggregateFrontendRepo = yield* getAggregateFrontendRepo({ key });
  const readiness = yield* makeAsync(() =>
    aggregateFrontendRepo.getProjectionReadiness(),
  ).pipe(Effect.flatMap(decodeRpc));
  if (readiness.generationId !== generationId) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-ticket-readiness-generation-mismatch',
      message: 'Frontend ticket readiness belongs to another generation',
      extra: {
        generationId,
        readinessGenerationId: readiness.generationId,
      },
    });
  }

  const aggregateFrontendBlockRepo = yield* getAggregateFrontendBlockRepo({
    key,
  });
  const descriptorUnknown = yield* makeAsync(() =>
    aggregateFrontendBlockRepo.getPredecessor(),
  );
  const descriptorEncoded = yield* Schema.decodeUnknown(
    Schema.Union(
      Schema.Struct({
        _tag: Schema.Literal('Right'),
        right: Schema.Struct({
          systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
          generationId: Schema.String,
          terminalFrontendIndex: Schema.Number,
          predecessor: Schema.NullOr(
            Schema.Struct({
              generationId: Schema.String,
              repoName: Schema.String,
              terminalFrontendIndex: Schema.Number,
            }),
          ),
        }),
      }),
      Schema.Struct({
        _tag: Schema.Literal('Left'),
        left: Schema.encodedSchema(ZerospinError.schema),
      }),
    ),
  )(descriptorUnknown).pipe(
    mapParseError({
      code: 'aggregate-frontend-ticket-archive-descriptor-invalid',
      prefix: 'Failed to decode AggregateFrontendBlockRepo descriptor RPC',
    }),
  );
  const descriptor = yield* decodeRpc(descriptorEncoded);
  if (
    descriptor.systemId !== systemId ||
    descriptor.generationId !== generationId ||
    descriptor.terminalFrontendIndex < readiness.frontendIndex
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-ticket-archive-target-mismatch',
      message: 'Frontend ticket target is not covered by its immutable archive',
    });
  }
  const archiveReadinessUnknown = yield* makeAsync(() =>
    aggregateFrontendBlockRepo.assertArchiveThrough({
      frontendIndex: readiness.frontendIndex,
    }),
  );
  const archiveReadinessEncoded = yield* Schema.decodeUnknown(
    Schema.Union(
      Schema.Struct({
        _tag: Schema.Literal('Right'),
        right: Schema.Undefined,
      }),
      Schema.Struct({
        _tag: Schema.Literal('Left'),
        left: Schema.encodedSchema(ZerospinError.schema),
      }),
    ),
  )(archiveReadinessUnknown).pipe(
    mapParseError({
      code: 'aggregate-frontend-ticket-archive-rpc-invalid',
      prefix: 'Failed to decode AggregateFrontendBlockRepo readiness RPC',
    }),
  );
  yield* decodeRpc(archiveReadinessEncoded);

  const ticket = yield* makeAsync(() =>
    systemRepo.createAggregateFrontendWebSocketTicket({
      generationId,
      repoName,
      aggregateId,
      aggregateName: props.actorRef.aggregateName,
      userId,
      frontendName: props.frontendName,
      aggregateFrontendLock: selected.aggregateFrontendLock,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  return { ticket };
});
