import { RoutePattern } from '@remix-run/route-pattern';
import config from 'config';

import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { serviceChainDbConfig } from './serviceChainDbConfig.js';
export const serviceChainFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.serviceChain,
  repoType: 'ServiceChain',
  namePattern: RoutePattern.parse('/:systemId/:serviceName'),
  managedRuntime: config.system.runtime,
  dbConfig: serviceChainDbConfig,
});
