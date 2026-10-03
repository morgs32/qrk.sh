import type { IDb } from '@zerospin/core/drizzle/types';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { serviceActorVersionRepoDbConfig } from '../serviceActorVersionRepoDbConfig.js';
/*
 * Projection callers inspect the locally committed projection cursor.
 * This reader reports local progress; publication durability is checked separately
 * by the snapshot path.
 *
 * 1. Read the local projection checkpoint.
 * 2. Return the local execution position.
 */
export const getProjectionReadiness = Effect.fn(
  'ServiceActorVersionRepo.getProjectionReadiness',
)(function* (props: { db: IDb; key: { systemId: string } }) {
  yield* Effect.void;

  // 1 — use actorState.executedIndex or zero before replay
  const index =
    props.db
      .select()
      .from(serviceActorVersionRepoDbConfig.schema.actorState)
      .where(eq(serviceActorVersionRepoDbConfig.schema.actorState.id, 1))
      .get()?.executedIndex ?? 0;

  // 2 — report the merged local execution position
  return {
    systemId: props.key.systemId,
    executedIndex: index,
  };
});
