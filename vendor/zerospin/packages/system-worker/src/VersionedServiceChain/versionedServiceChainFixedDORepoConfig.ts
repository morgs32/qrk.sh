import { RoutePattern } from '@remix-run/route-pattern';

import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { versionedServiceChainDbConfig } from './versionedServiceChainDbConfig.js';
export const versionedServiceChainFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.versionedServiceChain,
  repoType: 'VersionedServiceChain',
  namePattern: RoutePattern.parse('/:systemId/:serviceName/:serviceVersion'),
  managedRuntime,
  dbConfig: versionedServiceChainDbConfig,
});
