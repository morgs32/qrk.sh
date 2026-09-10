import { RoutePattern } from '@remix-run/route-pattern';

import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { serviceAdmittedChainDbConfig } from './serviceAdmittedChainDbConfig.js';
export const serviceAdmittedChainFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.serviceAdmittedChain,
  repoType: 'ServiceAdmittedChain',
  namePattern: RoutePattern.parse('/:systemId/:serviceName'),
  managedRuntime,
  dbConfig: serviceAdmittedChainDbConfig,
});
