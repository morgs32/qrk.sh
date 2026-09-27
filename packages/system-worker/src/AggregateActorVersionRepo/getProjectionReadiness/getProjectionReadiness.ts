import type { IDb } from '@zerospin/core/drizzle/types';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { aggregateActorVersionRepoDbConfig } from '../aggregateActorVersionRepoDbConfig.js';
/*
 * Replica callers inspect the locally committed projection cursor.
 * This reader reports local progress; publication durability is checked separately
 * by the snapshot path.
 *
 * 1. Read the local projection checkpoint.
 * 2. Return local aggregate and executed progress.
 */
export const getProjectionReadiness = Effect.fn(
  'AggregateActorVersionRepo.getProjectionReadiness',
)(function* (props: { db: IDb; key: { systemId: string } }) {
  yield* Effect.void;

  // 1 — use actorState.aggregateIndex or zero before replay
  const state = props.db
    .select()
    .from(aggregateActorVersionRepoDbConfig.schema.actorState)
    .where(eq(aggregateActorVersionRepoDbConfig.schema.actorState.id, 1))
    .get();

  // 2 — return the aggregate watermark and unified executed position
  return {
    systemId: props.key.systemId,
    aggregateIndex: state?.aggregateIndex ?? 0,
    executedIndex: state?.executedIndex ?? 0,
  };
});
