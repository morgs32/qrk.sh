import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import { AggregateSessionSnapshotSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import config from 'config';
import { and, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import { AggregateVersionRepo } from '../../AggregateVersionRepo/AggregateVersionRepo.js';
import { genesisExecutedHash } from '../../executedDispositionHash/executedDispositionHash.js';
import type { AggregateActorVersionRepo } from '../AggregateActorVersionRepo.js';
import { aggregateActorVersionRepoDbConfig } from '../aggregateActorVersionRepoDbConfig.js';
import type { applyExecutedCommands } from '../applyExecutedCommands/applyExecutedCommands.js';
import { catchup } from '../catchup/catchup.js';
import { readSelectedResources } from '../readSelectedResources.js';
import { resolveActorIdentity } from '../resolveActorIdentity/resolveActorIdentity.js';

const { system } = config;
/** Snapshot graph and cursor together, then wait for publication after the read transaction. */
/*
 * Session snapshots capture selected state, its cursor, and the requesting
 * node's resolved prefix together, then publish through that resource cursor.
 * Publication waits occur after the synchronous capture transaction completes.
 *
 * 1. Check the requested view identity.
 * 2. Catch the replica up to retained history.
 * 3. Capture state and its cursor together.
 * 4. Use the resources captured with the cursor.
 * 5. Publish through the captured cursor.
 * 6. Return resources, checkpoint, and the node watermark.
 */
export const getSnapshot = Effect.fn('AggregateActorVersionRepo.getSnapshot')(
  function* (
    props: Parameters<typeof catchup>[0] & {
      db: Parameters<typeof applyExecutedCommands>[0]['db'];
      key: Parameters<typeof applyExecutedCommands>[0]['key'];
      requested: {
        aggregateId: string;
        aggregateName: string;
        actorName: string;
        actorVersion: string;
        actorPath: string;
        sessionName: string;
        identity: Readonly<Record<string, unknown>>;
        nodeId: string | null;
      };
      actorCommandsOutbox: Pick<
        AggregateActorVersionRepo['actorCommandsOutbox'],
        'drain'
      >;
    },
  ) {
    const { key, requested, subscriber, db, actorCommandsOutbox } = props;

    // 1 — compare aggregateId, aggregateName, and actorPath with the bound key
    if (
      requested.actorName !== key.actorName ||
      requested.actorVersion !== key.actorVersion ||
      requested.aggregateId !== key.aggregateId ||
      requested.aggregateName !== key.aggregateName ||
      requested.actorPath !== key.actorPath
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'replica-state-target-mismatch',
          message: 'State request does not match the bound view',
        }),
      );
    }

    // 2 — replay through the captured VAC tip
    const owner = yield* AggregateVersionRepo.getRepo({ key });
    const throughExecutedIndex = yield* makeAsync(() =>
      owner.catchupMaterialization(),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    yield* catchup({ subscriber, throughExecutedIndex });
    const latest = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: key.aggregateName,
      recordKind: 'aggregates',
    });
    const aggregate = yield* getByKeyOrThrow({
      record: latest,
      key: key.aggregateVersion,
      recordKind: 'listed versions',
    });
    const view = yield* resolveAggregateActorVersion(
      { [aggregate.version]: aggregate },
      key,
    );
    const identity = yield* resolveActorIdentity({
      aggregate,
      actorName: key.actorName,
      actorVersion: key.actorVersion,
      actorPath: key.actorPath,
    });
    // 3 — synchronously capture resource rows and cursor in one transaction
    const captured = yield* makeTx('AggregateActorVersionRepo.captureSnapshot')(
      function* (
        tx: ITx<
          IResourceDbConfig<
            IAnyModels,
            typeof aggregateActorVersionRepoDbConfig.tables
          >
        >,
      ) {
        const state = tx
          .select()
          .from(aggregateActorVersionRepoDbConfig.schema.actorState)
          .where(eq(aggregateActorVersionRepoDbConfig.schema.actorState.id, 1))
          .get();
        const resources = yield* readSelectedResources({
          db: tx,
          models: aggregate.models,
          selections: view.selections,
          identity,
        });
        const rows =
          requested.nodeId === null
            ? []
            : tx
                .select({
                  nodeIndex:
                    aggregateActorVersionRepoDbConfig.schema.commands.nodeIndex,
                  identity:
                    aggregateActorVersionRepoDbConfig.schema.commands.identity,
                })
                .from(aggregateActorVersionRepoDbConfig.schema.commands)
                .where(
                  and(
                    eq(
                      aggregateActorVersionRepoDbConfig.schema.commands.nodeId,
                      requested.nodeId,
                    ),
                    eq(
                      aggregateActorVersionRepoDbConfig.schema.commands
                        .sessionName,
                      requested.sessionName,
                    ),
                  ),
                )
                .orderBy(
                  aggregateActorVersionRepoDbConfig.schema.commands.nodeIndex,
                )
                .all();
        let resolvedThrough = 0;
        for (const row of rows) {
          if (
            !isEqual(JSON.parse(row.identity ?? 'null'), requested.identity)
          ) {
            continue;
          }
          if (row.nodeIndex !== resolvedThrough + 1) break;
          resolvedThrough = row.nodeIndex;
        }
        return { state, resources, resolvedThrough };
      },
    )(db);

    // 4 — use the resources captured with the cursor
    const resources = captured.resources;
    const aggregateIndex = captured.state?.aggregateIndex ?? 0;
    const executedIndex = captured.state?.executedIndex ?? 0;
    const executedHash = captured.state?.executedHash ?? genesisExecutedHash();

    // 5 — drain the actor-command outbox after the capture transaction
    yield* actorCommandsOutbox.drain(executedIndex);
    // 6 — return the captured node watermark alongside resources and their checkpoint
    return yield* Schema.decodeUnknownEffect(
      Schema.toType(
        AggregateSessionSnapshotSchema.mapFields(
          ({ identity: _identity, ...fields }) => ({
            ...fields,
            actorPath: Schema.String,
          }),
        ),
      ),
    )({
      aggregateId: key.aggregateId,
      aggregateName: key.aggregateName,
      aggregateVersion: key.aggregateVersion,
      actorName: key.actorName,
      actorVersion: key.actorVersion,
      actorPath: key.actorPath,
      aggregateIndex,
      executedIndex,
      executedHash,
      sessionName: requested.sessionName,
      resolvedThrough: captured.resolvedThrough,
      resources,
    }).pipe(
      mapParseError({
        code: 'replica-state-invalid',
        prefix: 'Invalid definition snapshot',
      }),
    );
  },
);
