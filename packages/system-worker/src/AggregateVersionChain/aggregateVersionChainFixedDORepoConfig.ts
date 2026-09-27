import { RoutePattern } from '@remix-run/route-pattern';
import config from 'config';

import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { aggregateVersionChainDbConfig } from './aggregateVersionChainDbConfig.js';
export const aggregateVersionChainFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.aggregateVersionChain,
  repoType: 'AggregateVersionChain',
  namePattern: RoutePattern.parse(
    '/:systemId/:aggregateId/:aggregateName/:aggregateVersion',
  ),
  managedRuntime: config.system.runtime,
  dbConfig: aggregateVersionChainDbConfig,
});
