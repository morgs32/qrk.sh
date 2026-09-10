import type { IDb } from '@zerospin/core/drizzle/types';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { frontendVersionedServiceRepoDbConfig } from '../frontendVersionedServiceRepoDbConfig.js';
/*
 * Replica callers inspect the locally committed projection cursor.
 * This reader reports local progress; publication durability is checked separately
 * by the snapshot path.
 *
 * 1. Read the local projection checkpoint.
 * 2. Return local service and frontend progress.
 */
export const getProjectionReadiness = Effect.fn(
  'FrontendVersionedServiceRepo.getProjectionReadiness',
)(function* (props: { db: IDb; key: { systemId: string } }) {
  yield* Effect.void;

  // 1 — use projectionState.serviceIndex or zero before replay
  const index =
    props.db
      .select()
      .from(frontendVersionedServiceRepoDbConfig.schema.projectionState)
      .where(
        eq(frontendVersionedServiceRepoDbConfig.schema.projectionState.id, 1),
      )
      .get()?.serviceIndex ?? 0;

  // 2 — both indices identify the same per-command projected position
  return {
    systemId: props.key.systemId,
    serviceIndex: index,
    userIndex: index,
  };
});
