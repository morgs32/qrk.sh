import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

describe('DevZerospinApis local persistence compatibility', () => {
  it('retains controller rows across two separate Wrangler processes', async () => {
    // 1. Resolve the Wrangler dependency already owned by system-worker.
    //    Dispatch-worker does not acquire another test-only dependency.
    const requireFromSystemWorker = createRequire(
      path.join(packageRoot, '../system-worker/package.json'),
    );
    const wranglerPackageJsonPath = requireFromSystemWorker.resolve(
      'wrangler/package.json',
    );
    const wranglerModuleUrl = pathToFileURL(
      path.join(path.dirname(wranglerPackageJsonPath), 'wrangler-dist/cli.js'),
    ).href;
    const { unstable_dev } = await import(wranglerModuleUrl);

    // 2. Both independent Worker processes receive the exact same config,
    //    entrypoint, class name, and persistence directory.
    const temporaryRoot = await mkdtemp(
      path.join(tmpdir(), 'zerospin-local-controller-restart-'),
    );
    const persistenceDirectory = path.join(temporaryRoot, 'wrangler-state');
    const workerEntrypointPath = path.join(
      packageRoot,
      'tests/workerd/DevZerospinApis.restart.fixture.worker.ts',
    );
    const wranglerConfigPath = path.join(
      packageRoot,
      'wrangler.local-controller-restart.vitest.jsonc',
    );

    try {
      // 3. The first process creates recognizable lifecycle rows through the
      //    historical DevZerospinApis namespace key.
      const phaseOneWorker = await unstable_dev(workerEntrypointPath, {
        config: wranglerConfigPath,
        experimental: {
          disableDevRegistry: true,
          disableExperimentalWarning: true,
          watch: false,
        },
        ip: '127.0.0.1',
        logLevel: 'warn',
        persist: true,
        persistTo: persistenceDirectory,
        port: 0,
      });
      let phaseOneRows: unknown;
      try {
        const phaseOneReady = await phaseOneWorker.fetch(
          'http://zerospin.test/__zerospin/ready',
        );
        expect(phaseOneReady.status, await phaseOneReady.clone().text()).toBe(
          204,
        );

        const phaseOneSnapshot = await phaseOneWorker.fetch(
          'http://zerospin.test/__test/local-controller-snapshot',
        );
        expect(
          phaseOneSnapshot.status,
          await phaseOneSnapshot.clone().text(),
        ).toBe(200);
        phaseOneRows = await phaseOneSnapshot.json();
      } finally {
        // This teardown is the boundary under test. Phase two creates a new
        // Wrangler/workerd process rather than reloading this instance.
        await phaseOneWorker.stop();
      }

      // 4. Confirm phase one wrote a complete, recognizable control record.
      expect(phaseOneRows).toMatchObject({
        systemInstance: {
          systemWorkerName: 'sys_local:local',
          systemId: 'sys_local',
          instanceId: 'local',
        },
        deploy: {
          deployIndex: 1,
          prevDeployId: null,
          status: 'succeeded',
          phase: 'complete',
          failure: null,
        },
        generation: {
          prevGenerationId: null,
        },
        cleanRequest: {
          id: 'cln_local_controller_restart',
        },
        deployLogs: [
          {
            eventIndex: 1,
            phase: 'checking',
            message: 'Local deploy candidate allocated',
          },
          {
            eventIndex: 2,
            phase: 'preparing',
            message: 'Preparing the selected local generation',
          },
          {
            eventIndex: 3,
            phase: 'activating',
            message: 'Reserved local deploy activation',
          },
          {
            eventIndex: 4,
            phase: 'complete',
            message: 'Local deploy activated',
          },
        ],
      });

      // 5. Start a completely separate Worker process against the same local
      //    DevZerospinApis namespace and persistence root.
      const phaseTwoWorker = await unstable_dev(workerEntrypointPath, {
        config: wranglerConfigPath,
        experimental: {
          disableDevRegistry: true,
          disableExperimentalWarning: true,
          watch: false,
        },
        ip: '127.0.0.1',
        logLevel: 'warn',
        persist: true,
        persistTo: persistenceDirectory,
        port: 0,
      });
      try {
        const phaseTwoReady = await phaseTwoWorker.fetch(
          'http://zerospin.test/__zerospin/ready',
        );
        expect(phaseTwoReady.status, await phaseTwoReady.clone().text()).toBe(
          204,
        );

        const phaseTwoSnapshot = await phaseTwoWorker.fetch(
          'http://zerospin.test/__test/local-controller-snapshot',
        );
        expect(
          phaseTwoSnapshot.status,
          await phaseTwoSnapshot.clone().text(),
        ).toBe(200);

        // 6. Read through the active phase-two Durable Object. A fresh class
        //    namespace cannot manufacture these exact random phase-one ids,
        //    timestamps, and linked log payloads.
        expect(await phaseTwoSnapshot.json()).toEqual(phaseOneRows);
      } finally {
        await phaseTwoWorker.stop();
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }, 300_000);
});
