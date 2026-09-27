import { RoutePattern } from '@remix-run/route-pattern';
import config from 'config';

import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { serviceVersionChainDbConfig } from './serviceVersionChainDbConfig.js';
export const serviceVersionChainFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.serviceVersionChain,
  repoType: 'ServiceVersionChain',
  namePattern: RoutePattern.parse('/:systemId/:serviceName/:serviceVersion'),
  managedRuntime: config.system.runtime,
  dbConfig: serviceVersionChainDbConfig,
});
