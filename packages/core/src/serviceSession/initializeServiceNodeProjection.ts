import { makeZerospinError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Schema, type Effect } from 'effect';

import type { ISessionId } from '../aggregateSession/types.ts';
import { makeTx } from '../drizzle/make/makeTx.ts';
import type { ITx } from '../drizzle/types.ts';
import type { IEncodedResourceShape } from '../models/types.ts';
import { decodeNodeResource } from '../Node/decodeNodeResource.ts';
import type {
  IServiceNodeIdentity,
  IServiceStagedCommand,
} from '../ServiceNode/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { importServiceCommandTx } from './importServiceNodeCommands.ts';
import type { IServiceSessionReplayRequirements } from './replayPendingServiceCommandsTx.ts';
import { serviceSessionRepoDbConfig } from './serviceSessionRepoTables.ts';
import type {
  IServiceSessionDefinition,
  IServiceSessionDrizzleDb,
} from './types.ts';

type Snapshot = Readonly<{
  identity: IServiceNodeIdentity;
  metadata: Readonly<{
    serviceIndex: number;
    executedIndex: number;
    serviceHash: string;
    changeIndex: number;
  }>;
  resources: readonly IEncodedResourceShape[];
  unresolvedCommands: readonly IServiceStagedCommand[];
}>;

const initializeTx = makeTx('initializeServiceNodeProjection')(function* (
  tx: ITx,
  props: {
    definition: IServiceSessionDefinition;
    sessionId: ISessionId;
    snapshot: Snapshot;
  },
) {
  tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
  const { serviceSessionMetadata: sessionMetadata } =
    serviceSessionRepoDbConfig.schema;
  if (tx.select().from(sessionMetadata).get() !== undefined)
    return yield* makeZerospinError('session-projection-already-initialized');
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
      serviceVersion: definition.serviceVersion,
      nextSessionIndex: 1,
      serviceIndex: snapshot.metadata.serviceIndex,
      executedIndex: snapshot.metadata.executedIndex,
      serviceHash: snapshot.metadata.serviceHash,
      changeIndex: snapshot.metadata.changeIndex,
    })
    .run();
  for (const command of snapshot.unresolvedCommands)
    yield* importServiceCommandTx({ tx, definition, sessionId, command });
  const metadata = tx.select().from(sessionMetadata).get();
  if (metadata === undefined)
    return yield* makeZerospinError('session-metadata-missing');
  return metadata;
});

/** Install the Node's captured baseline once; ordinary deliveries use the incremental importer. */
type IInitializeServiceNodeProjectionProps<
  DEFINITION extends IServiceSessionDefinition = IServiceSessionDefinition,
> = {
  db: IServiceSessionDrizzleDb;
  definition: DEFINITION;
  sessionId: ISessionId;
  snapshot: Snapshot;
};

export function initializeServiceNodeProjection<
  DEFINITION extends IServiceSessionDefinition,
>(
  props: IInitializeServiceNodeProjectionProps<DEFINITION>,
): Effect.Effect<
  Effect.Success<ReturnType<typeof initializeTx>>,
  Effect.Error<ReturnType<typeof initializeTx>>,
  IServiceSessionReplayRequirements<DEFINITION>
>;
export function initializeServiceNodeProjection(
  props: IInitializeServiceNodeProjectionProps,
) {
  const { db, ...input } = props;
  return initializeTx(db, input);
}
