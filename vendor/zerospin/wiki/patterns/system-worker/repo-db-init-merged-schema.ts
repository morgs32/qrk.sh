/**
 * Compose resource DB configs from owning models and the fixed DB config's tables
 * so the factory derives one schema-and-relations graph.
 *
 * @bad Separate exported table maps alongside the fixed DB config.
 * @bad Do not build `{ schema, relations }` manually instead of passing the owning table graph.
 */
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import type { IAnyModels } from '@zerospin/core/models/types';

import { aggregateActorVersionRepoDbConfig } from '../../../../packages/system-worker/src/AggregateActorVersionRepo/aggregateActorVersionRepoDbConfig.js';

export function getAggregateActorVersionRepoDbConfig(props: {
  models: IAnyModels;
}) {
  return makeResourceDbConfig({
    models: props.models,
    otherTables: aggregateActorVersionRepoDbConfig.tables,
  });
}
