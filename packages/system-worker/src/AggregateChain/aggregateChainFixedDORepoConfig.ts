import { RoutePattern } from '@remix-run/route-pattern';
import config from 'config';

import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';

/**
 * Sibling of the AC class module so ServiceChain can import
 * `nameUtils` without loading `AggregateChain.ts` (cycle:
 * AC → SCC → AC).
 */
export const aggregateChainFixedDORepoConfig = makeFixedDORepoConfig({
  repoType: 'AggregateChain',
  abbreviation: systemWorkerAbbreviations.aggregateChain,
  namePattern: RoutePattern.parse('/:systemId/:aggregateId/:aggregateName'),
  managedRuntime: config.system.runtime,
  dbConfig: aggregateChainDbConfig,
});
