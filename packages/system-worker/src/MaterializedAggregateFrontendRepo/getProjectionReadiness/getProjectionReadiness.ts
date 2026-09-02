import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { materializedAggregateFrontendRepoDrizzleSchemas } from '../MaterializedAggregateFrontendRepoDbConfig.js';

export const getProjectionReadiness = Effect.fn(
  'MaterializedAggregateFrontendRepo.getProjectionReadiness',
)(function* (props: {
  db: IDb;
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
}) {
  const state = props.db
    .select()
    .from(materializedAggregateFrontendRepoDrizzleSchemas.projectionState)
    .where(
      eq(materializedAggregateFrontendRepoDrizzleSchemas.projectionState.id, 1),
    )
    .get();
  if (state === undefined || state.status !== 'ready') {
    return yield* new ZerospinError({
      code: 'materialized-aggregate-frontend-not-ready',
      message: 'Materialized aggregate frontend projection is not ready',
    });
  }
  return {
    systemId: props.key.systemId,
    aggregateIndex: state.aggregateIndex,
    frontendIndex: state.frontendIndex,
  };
});
