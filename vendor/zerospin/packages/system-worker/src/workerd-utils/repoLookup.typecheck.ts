import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { FixedDORepoFixture } from '../makeFixedDORepo/test/FixedDORepoFixture.js';
import { makeVersionedDORepo } from '../makeVersionedDORepo/makeVersionedDORepo.js';
import { VersionedDORepoFixture } from '../makeVersionedDORepo/test/VersionedDORepoFixture.js';
import { SystemLogRepo } from '../SystemLogRepo/SystemLogRepo.js';
import { VersionedServiceRepo } from '../VersionedServiceRepo/VersionedServiceRepo.js';

const fixedLookup = FixedDORepoFixture.getRepo;
const versionedLookup = VersionedDORepoFixture.getRepo;
const fixed: Effect.Effect<
  DurableObjectStub<FixedDORepoFixture>,
  IAnyError
> = fixedLookup({ key: { scenario: 'typecheck', id: 'fixed' } });
const versioned: Effect.Effect<
  DurableObjectStub<VersionedDORepoFixture>,
  IAnyError
> = versionedLookup({ key: { scenario: 'typecheck', id: 'versioned' } });
void fixed;
void versioned;

// @ts-expect-error Both route fields are required on inherited fixed lookup.
fixedLookup({ key: { id: 'fixed' } });
// @ts-expect-error Both route fields are required on inherited versioned lookup.
versionedLookup({ key: { scenario: 'typecheck' } });
// @ts-expect-error Route key values remain strings.
fixedLookup({ key: { scenario: 'typecheck', id: 1 } });

makeFixedDORepo({
  // @ts-expect-error Configuration values are not namespace bindings.
  namespaceBinding: 'ZEROSPIN_SYSTEM_ID',
  fixedDORepoConfig: FixedDORepoFixture.fixedDORepoConfig,
});
makeVersionedDORepo({
  // @ts-expect-error Unknown namespace names are rejected.
  namespaceBinding: 'MISSING_REPO',
  versionedDORepoConfig: VersionedDORepoFixture.versionedDORepoConfig,
});

const logLookup = SystemLogRepo.getRepo;
const serviceLookup = VersionedServiceRepo.getRepo;
void Effect.gen(function* () {
  const log = yield* logLookup({ key: { systemId: 'sys_1' } });
  const append: Parameters<SystemLogRepo['appendLogRow']>[0] = {
    level: 'info',
    message: 'lookup',
    payload: null,
    source: 'test',
  };
  const result: ReturnType<SystemLogRepo['appendLogRow']> =
    log.appendLogRow(append);
  void result;
  // @ts-expect-error Concrete RPC argument types survive namespace selection.
  log.appendLogRow({ ...append, level: 42 });
  // @ts-expect-error A service-only method cannot appear on the log stub.
  log.executeServiceQuery({});

  const service = yield* serviceLookup({
    key: { systemId: 'sys_1', serviceName: 'catalog', serviceVersion: '1.0.0' },
  });
  // @ts-expect-error A log-only method cannot appear on the service stub.
  service.appendLogRow(append);
});
