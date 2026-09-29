import { RoutePattern } from '@remix-run/route-pattern';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import config from 'config';
import { Effect } from 'effect';

import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { resolveServiceActorView } from './resolveServiceActorView.js';
import { serviceActorVersionRepoDbConfig } from './serviceActorVersionRepoDbConfig.js';

const { system } = config;

/** Name and fixed-schema metadata stay independent of the class and its VSC/FSC RPC dependencies. */
/*
 * ServiceActorVersionRepo activation resolves its resource schema from the
 * physical Repo key. Name metadata stays independent of the Repo class so
 * upstream lookups can share the contract without loading its RPC dependencies.
 *
 * 1. Resolve the bound service.
 * 2. Select the bound service snapshot.
 * 3. Validate the actor binding and build version-owned replica storage.
 */
export const serviceActorVersionRepoFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.serviceActorVersionRepo,
  repoType: 'ServiceActorVersionRepo',
  namePattern: RoutePattern.parse(
    '/:systemId/:serviceName/:serviceVersion/:actorName/:actorVersion/:actorPath',
  ),
  managedRuntime: config.system.runtime,
  dbConfig: Effect.fn('ServiceActorVersionRepo.dbConfig')(function* ({ key }) {
    // 1 — read system.services by key.serviceName
    const service = yield* getByKeyOrThrow({
      record: system.services,
      key: key.serviceName,
      recordKind: 'services',
    });

    // 2 — require authored support for key.serviceVersion
    const version = yield* getByKeyOrThrow({
      record: service,
      key: key.serviceVersion,
      recordKind: 'listed versions',
    });

    // 3 — validate the actor binding before constructing its resource schema.
    yield* resolveServiceActorView(version, key);
    // Supply the exact selected service model registry
    return makeResourceDbConfig({
      otherTables: serviceActorVersionRepoDbConfig.tables,
      models: version.models,
    });
  }),
});
