import { Cause, Effect, Exit } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SystemLogRepo } from '../SystemLogRepo/SystemLogRepo.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';
import { VersionedServiceRepo } from '../VersionedServiceRepo/VersionedServiceRepo.js';

const { getByName, readNamespace } = vi.hoisted(() => ({
  getByName: vi.fn(),
  readNamespace: vi.fn(),
}));

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {},
  RpcTarget: class {},
  WorkerEntrypoint: class {},
  env: {
    get SYSTEM_LOG_REPO() {
      readNamespace();
      return { getByName };
    },
    SYSTEM_REPO: { getByName },
    VERSIONED_SERVICE_REPO: { getByName },
  },
  exports: {},
}));

const namespaceReadsAtImport = readNamespace.mock.calls.length;

describe('Repo.getRepo', () => {
  beforeEach(() => {
    getByName.mockReset();
    readNamespace.mockClear();
  });

  it('resolves only when run and passes the exact stub through a detached callback', async () => {
    const stub = { appendLogRow: vi.fn(), ready: vi.fn() };
    getByName.mockReturnValue(stub);
    const getRepo = SystemLogRepo.getRepo;
    const lookup = getRepo({ key: { systemId: 'sys_1' } });

    expect(namespaceReadsAtImport).toBe(0);
    expect(readNamespace).not.toHaveBeenCalled();
    expect(getByName).not.toHaveBeenCalled();
    expect(await Effect.runPromise(lookup)).toBe(stub);
    expect(readNamespace).toHaveBeenCalledTimes(1);
    expect(getByName).toHaveBeenCalledExactlyOnceWith('syslogrepo_sys_1');
    expect(stub.appendLogRow).not.toHaveBeenCalled();
    expect(stub.ready).not.toHaveBeenCalled();
  });

  it('preserves segment encoding and the version-specific physical name', async () => {
    await Effect.runPromise(
      VersionedServiceRepo.getRepo({
        key: { systemId: 'sys_1', serviceName: 'a/b', serviceVersion: '1.0.0' },
      }),
    );
    expect(getByName).toHaveBeenCalledExactlyOnceWith('vsr_sys_1/a%2Fb/1.0.0');
  });

  it('fails name encoding before reading the namespace', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        SystemLogRepo.getRepo({
          // @ts-expect-error Exercise a malformed runtime key that TypeScript rejects.
          key: {},
        }),
      ),
    );
    expect(error.code).toBe('repo-key-encode-failed');
    expect(readNamespace).not.toHaveBeenCalled();
    expect(getByName).not.toHaveBeenCalled();
  });

  it('preserves namespace exceptions as defects', async () => {
    const error = new Error('namespace lookup failed');
    getByName.mockImplementation(() => {
      throw error;
    });
    const exit = await Effect.runPromiseExit(
      SystemLogRepo.getRepo({
        key: { systemId: 'sys_1' },
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(exit.cause.reasons).toContainEqual(Cause.makeDieReason(error));
    }
  });

  it('uses the unprefixed SystemRepo name and leaves ID validation to activation', async () => {
    await Effect.runPromise(
      SystemRepo.getRepo({ key: { systemId: 'invalid-id' } }),
    );
    expect(getByName).toHaveBeenCalledExactlyOnceWith('invalid-id');
  });
});
