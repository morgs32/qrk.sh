import type { IDb } from '@zerospin/core/drizzle/types';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { userVersionedAggregateRepoDbConfig } from '../userVersionedAggregateRepoDbConfig.js';
/*
 * Replica callers inspect the locally committed projection cursor.
 * This reader reports local progress; publication durability is checked separately
 * by the snapshot path.
 *
 * 1. Read the local projection checkpoint.
 * 2. Return local aggregate and user progress.
 */
export const getProjectionReadiness = Effect.fn(
  'UserVersionedAggregateRepo.getProjectionReadiness',
)(function* (props: { db: IDb; key: { systemId: string } }) {
  yield* Effect.void;

  // 1 — use projectionState.aggregateIndex or zero before replay
  const state = props.db
    .select()
    .from(userVersionedAggregateRepoDbConfig.schema.projectionState)
    .where(eq(userVersionedAggregateRepoDbConfig.schema.projectionState.id, 1))
    .get();

  // 2 — aggregate consumption and user output have separate cursors
  return {
    systemId: props.key.systemId,
    aggregateIndex: state?.aggregateIndex ?? 0,
    userIndex: state?.userIndex ?? 0,
  };
});
