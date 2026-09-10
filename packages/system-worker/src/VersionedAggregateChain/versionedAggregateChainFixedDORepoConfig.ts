import { RoutePattern } from '@remix-run/route-pattern';

import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { versionedAggregateChainDbConfig } from './versionedAggregateChainDbConfig.js';
export const versionedAggregateChainFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.versionedAggregateChain,
  repoType: 'VersionedAggregateChain',
  namePattern: RoutePattern.parse(
    '/:systemId/:aggregateId/:aggregateName/:aggregateVersion',
  ),
  managedRuntime,
  dbConfig: versionedAggregateChainDbConfig,
});
