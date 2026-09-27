import { RoutePattern } from '@remix-run/route-pattern';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeZerospinError } from '@zerospin/error';
import config from 'config';
import { Effect } from 'effect';

import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { serviceVersionRepoDbConfig } from './serviceVersionRepoDbConfig.js';

const { system } = config;

/**
 * Sibling of the VSR class module so ServiceChain can import
 * `nameUtils` without loading `ServiceVersionRepo.ts` (cycle:
 * VSR → SC → VSR).
 */
/*
 * ServiceVersionRepo activation resolves its resource schema from the
 * physical Repo key. Name metadata stays independent of the Repo class so
 * upstream lookups can share the contract without loading its RPC dependencies.
 *
 * 1. Resolve the service from the Repo key.
 * 2. Build owner resources and progress tables.
 */
export const serviceVersionRepoFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.serviceVersionRepo,
  repoType: 'ServiceVersionRepo',
  namePattern: RoutePattern.parse('/:systemId/:serviceName/:serviceVersion'),
  managedRuntime: config.system.runtime,
  dbConfig: Effect.fn('ServiceVersionRepo.dbConfig')(function* ({ key }) {
    // 1 — reject a serviceName absent from the authored System
    const service = system.services[key.serviceName]?.[key.serviceVersion];
    if (service === undefined) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'service-service-not-found',
          message: `Service ${key.serviceName} was not found`,
        }),
      );
    }

    // 2 — supply exactly the service-owned models
    return makeResourceDbConfig({
      otherTables: serviceVersionRepoDbConfig.tables,
      models: service.models,
    });
  }),
});
