import { RoutePattern } from '@remix-run/route-pattern';

import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';

/**
 * Sibling of the AC class module so ServiceAdmittedChain can import
 * `nameUtils` without loading `AggregateChain.ts` (cycle:
 * AC → SCC → AC).
 */
export const aggregateChainFixedDORepoConfig = makeFixedDORepoConfig({
  repoType: 'AggregateChain',
  abbreviation: systemWorkerAbbreviations.aggregateChain,
  namePattern: RoutePattern.parse('/:systemId/:aggregateId/:aggregateName'),
  managedRuntime,
  dbConfig: aggregateChainDbConfig,
});
