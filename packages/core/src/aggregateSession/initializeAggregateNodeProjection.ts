import { makeZerospinError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Schema, type Effect } from 'effect';

import type {
  IAggregateNodeIdentity,
  IAggregateStagedCommand,
} from '../AggregateNode/types.ts';
import { makeTx } from '../drizzle/make/makeTx.ts';
import type { ITx } from '../drizzle/types.ts';
import type { IEncodedResourceShape } from '../models/types.ts';
import { decodeNodeResource } from '../Node/decodeNodeResource.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { importAggregateCommandTx } from './importAggregateNodeCommands.ts';
import type { IAggregateSessionReplayRequirements } from './replayPendingCommandsTx.ts';
import { sessionRepoDbConfig } from './sessionRepoDbConfig.ts';
import type {
  IAggregateSessionDefinition,
  ISessionDrizzleDb,
  ISessionId,
} from './types.ts';

type Snapshot = Readonly<{
  identity: IAggregateNodeIdentity;
  metadata: Readonly<{
    aggregateIndex: number;
    executedIndex: number;
    executedHash: string;
    changeIndex: number;
  }>;
  resources: readonly IEncodedResourceShape[];
  unresolvedCommands: readonly IAggregateStagedCommand[];
}>;

const initializeTx = makeTx('initializeAggregateNodeProjection')(function* (
  tx: ITx,
  props: {
    definition: IAggregateSessionDefinition;
    sessionId: ISessionId;
    snapshot: Snapshot;
  },
) {
  tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
  const { sessionMetadata } = sessionRepoDbConfig.schema;
  if (tx.select().from(sessionMetadata).get() !== undefined) {
    return yield* makeZerospinError('session-projection-already-initialized');
  }
  const { definition, sessionId, snapshot } = props;
  for (const resource of snapshot.resources) {
    const model = yield* getByKeyOrThrow({
      record: definition.models,
      key: resource.modelName,
      recordKind: 'session models',
    });
    const resourceRow = decodeNodeResource(
      resource,
      model.spec.propertiesShape,
    );
    yield* Schema.decodeUnknownEffect(model.table.codec)(resourceRow, {
      onExcessProperty: 'error',
    });
    tx.insert(model.drizzleSchema).values(resourceRow).run();
  }
  tx.insert(sessionMetadata)
    .values({
      sessionId,
      actorName: definition.actorName,
      actorVersion: definition.actorVersion,
      nextSessionIndex: 1,
      pushIndex: 0,
      aggregateIndex: snapshot.metadata.aggregateIndex,
      executedIndex: snapshot.metadata.executedIndex,
      executedHash: snapshot.metadata.executedHash,
      changeIndex: snapshot.metadata.changeIndex,
    })
    .run();
  for (const command of snapshot.unresolvedCommands) {
    yield* importAggregateCommandTx({ tx, definition, sessionId, command });
  }
  const metadata = tx.select().from(sessionMetadata).get();
  if (metadata === undefined) {
    return yield* makeZerospinError('session-metadata-missing');
  }
  return metadata;
});

/** Install the Node's captured baseline once; ordinary deliveries use the incremental importer. */
type IInitializeAggregateNodeProjectionProps<
  DEFINITION extends IAggregateSessionDefinition = IAggregateSessionDefinition,
> = {
  db: ISessionDrizzleDb;
  definition: DEFINITION;
  sessionId: ISessionId;
  snapshot: Snapshot;
};

export function initializeAggregateNodeProjection<
  DEFINITION extends IAggregateSessionDefinition,
>(
  props: IInitializeAggregateNodeProjectionProps<DEFINITION>,
): Effect.Effect<
  Effect.Success<ReturnType<typeof initializeTx>>,
  Effect.Error<ReturnType<typeof initializeTx>>,
  IAggregateSessionReplayRequirements<DEFINITION>
>;
export function initializeAggregateNodeProjection(
  props: IInitializeAggregateNodeProjectionProps,
) {
  const { db, ...input } = props;
  return initializeTx(db, input);
}
