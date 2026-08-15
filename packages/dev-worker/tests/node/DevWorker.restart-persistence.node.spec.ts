import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import { Effect, Schema } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const DeploySnapshotSchema = Schema.Struct({
  activationCheckpoint: Schema.String,
  clean: Schema.Boolean,
  deployId: Schema.String,
  failure: Schema.NullOr(Schema.Unknown),
  generationId: Schema.String,
  status: Schema.String,
  workerVersionId: Schema.String,
});

const SystemRepoSnapshotSchema = Schema.Struct({
  deploys: Schema.Array(
    Schema.Struct({
      activationCheckpoint: Schema.String,
      clean: Schema.Boolean,
      generationId: Schema.String,
      id: Schema.String,
      prevDeployId: Schema.NullOr(Schema.String),
      status: Schema.String,
      workerVersionId: Schema.String,
    }),
  ),
  generations: Schema.Array(
    Schema.Struct({
      generationId: Schema.String,
      initialDeployId: Schema.String,
      phase: Schema.String,
      prevGenerationId: Schema.NullOr(Schema.String),
      successorGenerationId: Schema.NullOr(Schema.String),
    }),
  ),
  selection: Schema.Array(
    Schema.Struct({
      activeDeployId: Schema.NullOr(Schema.String),
      activatingDeployId: Schema.NullOr(Schema.String),
      lastWriteIndex: Schema.Number,
      writeGenerationId: Schema.NullOr(Schema.String),
    }),
  ),
});

describe('DevWorker SystemRepo local deployment persistence', () => {
  it('resumes one same-version same-clean deploy across processes and makes opposite clean distinct', async () => {
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

    const temporaryRoot = await mkdtemp(
      path.join(tmpdir(), 'zerospin-system-repo-restart-'),
    );
    const persistenceDirectory = path.join(temporaryRoot, 'wrangler-state');
    const workerEntrypointPath = path.join(
      packageRoot,
      'tests/workerd/DevWorker.restart.fixture.worker.ts',
    );
    const wranglerConfigPath = path.join(
      packageRoot,
      'wrangler.local-system-repo-restart.vitest.jsonc',
    );

    try {
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
        vars: {
          TESTING: true,
          WORKER_VERSION_METADATA: {
            id: 'restart-test-bundle',
            tag: 'restart-test',
            timestamp: '2026-08-10T00:00:00.000Z',
          },
          ZEROSPIN_ENVIRONMENT: 'dev',
          ZEROSPIN_SYSTEM_ID: 'sys_local',
          ZEROSPIN_TEST_INTERRUPT_ACTIVATION: true,
        },
      });
      let interruptedDeploy;
      try {
        using gatewayApi = newSyncRpcSession<GatewayApi>(
          `http://${phaseOneWorker.address}:${phaseOneWorker.port}`,
        );
        interruptedDeploy = Schema.decodeUnknownSync(DeploySnapshotSchema)(
          await Effect.runPromise(
            decodeRpc(
              await gatewayApi.getDevDeployApi().startDeploy({ clean: false }),
            ),
          ),
        );
        expect(interruptedDeploy).toMatchObject({
          activationCheckpoint: 'allocated',
          status: 'activating',
        });

        const snapshotResponse = await phaseOneWorker.fetch(
          `http://zerospin.test/__test/system-repo-snapshot?generationId=${encodeURIComponent(interruptedDeploy.generationId)}`,
        );
        expect(
          snapshotResponse.status,
          await snapshotResponse.clone().text(),
        ).toBe(200);
        const interruptedSnapshot = Schema.decodeUnknownSync(
          SystemRepoSnapshotSchema,
        )(await snapshotResponse.json());
        expect(interruptedSnapshot.selection).toEqual([
          {
            activeDeployId: null,
            activatingDeployId: interruptedDeploy.deployId,
            lastWriteIndex: 0,
            writeGenerationId: null,
          },
        ]);
        expect(interruptedSnapshot.deploys).toMatchObject([
          {
            activationCheckpoint: 'allocated',
            id: interruptedDeploy.deployId,
            status: 'activating',
          },
        ]);
      } finally {
        await phaseOneWorker.stop();
      }

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
      let phaseTwoSnapshot;
      let sameModeDeploy;
      try {
        using resumedGatewayApi = newSyncRpcSession<GatewayApi>(
          `http://${phaseTwoWorker.address}:${phaseTwoWorker.port}`,
        );
        const resumed = Schema.decodeUnknownSync(DeploySnapshotSchema)(
          await Effect.runPromise(
            decodeRpc(
              await resumedGatewayApi
                .getDevDeployApi()
                .startDeploy({ clean: false }),
            ),
          ),
        );
        expect(resumed.deployId).toBe(interruptedDeploy.deployId);
        let resumedCompleted = resumed;
        for (
          let attempt = 0;
          resumedCompleted.status === 'activating' && attempt < 100;
          attempt += 1
        ) {
          using pollGatewayApi = newSyncRpcSession<GatewayApi>(
            `http://${phaseTwoWorker.address}:${phaseTwoWorker.port}`,
          );
          resumedCompleted = Schema.decodeUnknownSync(DeploySnapshotSchema)(
            await Effect.runPromise(
              decodeRpc(
                await pollGatewayApi
                  .getDevDeployApi()
                  .getDeploy({ deployId: resumed.deployId }),
              ),
            ),
          );
        }
        expect(resumedCompleted.status).toBe('succeeded');

        using repeatedGatewayApi = newSyncRpcSession<GatewayApi>(
          `http://${phaseTwoWorker.address}:${phaseTwoWorker.port}`,
        );
        sameModeDeploy = Schema.decodeUnknownSync(DeploySnapshotSchema)(
          await Effect.runPromise(
            decodeRpc(
              await repeatedGatewayApi
                .getDevDeployApi()
                .startDeploy({ clean: false }),
            ),
          ),
        );
        expect(sameModeDeploy.deployId).toBe(resumed.deployId);
        expect(sameModeDeploy.generationId).toBe(resumed.generationId);
        expect(sameModeDeploy.workerVersionId).toBe(resumed.workerVersionId);
        let repeatedCompleted = sameModeDeploy;
        for (
          let attempt = 0;
          repeatedCompleted.status === 'activating' && attempt < 100;
          attempt += 1
        ) {
          using pollGatewayApi = newSyncRpcSession<GatewayApi>(
            `http://${phaseTwoWorker.address}:${phaseTwoWorker.port}`,
          );
          repeatedCompleted = Schema.decodeUnknownSync(DeploySnapshotSchema)(
            await Effect.runPromise(
              decodeRpc(
                await pollGatewayApi.getDevDeployApi().getDeploy({
                  deployId: sameModeDeploy.deployId,
                }),
              ),
            ),
          );
        }
        expect(repeatedCompleted.status).toBe('succeeded');

        const snapshotResponse = await phaseTwoWorker.fetch(
          `http://zerospin.test/__test/system-repo-snapshot?generationId=${encodeURIComponent(sameModeDeploy.generationId)}`,
        );
        expect(
          snapshotResponse.status,
          await snapshotResponse.clone().text(),
        ).toBe(200);
        phaseTwoSnapshot = Schema.decodeUnknownSync(SystemRepoSnapshotSchema)(
          await snapshotResponse.json(),
        );
      } finally {
        await phaseTwoWorker.stop();
      }

      expect(phaseTwoSnapshot.deploys).toHaveLength(1);
      expect(phaseTwoSnapshot.generations).toHaveLength(1);
      expect(
        new Set(phaseTwoSnapshot.deploys.map(deploy => deploy.id)).size,
      ).toBe(1);
      expect(
        new Set(phaseTwoSnapshot.deploys.map(deploy => deploy.workerVersionId))
          .size,
      ).toBe(1);
      expect(phaseTwoSnapshot.selection).toEqual([
        {
          activeDeployId: sameModeDeploy.deployId,
          activatingDeployId: null,
          lastWriteIndex: 0,
          writeGenerationId: sameModeDeploy.generationId,
        },
      ]);

      const phaseThreeWorker = await unstable_dev(workerEntrypointPath, {
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
      let phaseThreeSnapshot;
      let cleanDeploy;
      try {
        using gatewayApi = newSyncRpcSession<GatewayApi>(
          `http://${phaseThreeWorker.address}:${phaseThreeWorker.port}`,
        );
        cleanDeploy = Schema.decodeUnknownSync(DeploySnapshotSchema)(
          await Effect.runPromise(
            decodeRpc(
              await gatewayApi.getDevDeployApi().startDeploy({ clean: true }),
            ),
          ),
        );
        let cleanCompleted = cleanDeploy;
        for (
          let attempt = 0;
          cleanCompleted.status === 'activating' && attempt < 100;
          attempt += 1
        ) {
          using pollGatewayApi = newSyncRpcSession<GatewayApi>(
            `http://${phaseThreeWorker.address}:${phaseThreeWorker.port}`,
          );
          cleanCompleted = Schema.decodeUnknownSync(DeploySnapshotSchema)(
            await Effect.runPromise(
              decodeRpc(
                await pollGatewayApi.getDevDeployApi().getDeploy({
                  deployId: cleanDeploy.deployId,
                }),
              ),
            ),
          );
        }
        expect(cleanCompleted.status).toBe('succeeded');

        const snapshotResponse = await phaseThreeWorker.fetch(
          `http://zerospin.test/__test/system-repo-snapshot?generationId=${encodeURIComponent(sameModeDeploy.generationId)}&generationId=${encodeURIComponent(cleanDeploy.generationId)}`,
        );
        phaseThreeSnapshot = Schema.decodeUnknownSync(SystemRepoSnapshotSchema)(
          await snapshotResponse.json(),
        );
      } finally {
        await phaseThreeWorker.stop();
      }

      expect(phaseThreeSnapshot.deploys).toHaveLength(2);
      expect(phaseThreeSnapshot.generations).toHaveLength(2);
      const cleanGeneration = phaseThreeSnapshot.generations.find(
        generation => generation.generationId === cleanDeploy.generationId,
      );
      expect(cleanGeneration).toMatchObject({
        phase: 'open',
        initialDeployId: cleanDeploy.deployId,
        prevGenerationId: null,
      });
      expect(
        phaseThreeSnapshot.generations.find(
          generation => generation.generationId !== cleanDeploy.generationId,
        ),
      ).toMatchObject({
        phase: 'retired',
        successorGenerationId: null,
      });
      expect(phaseThreeSnapshot.selection).toEqual([
        {
          activeDeployId: cleanDeploy.deployId,
          activatingDeployId: null,
          lastWriteIndex: 0,
          writeGenerationId: cleanDeploy.generationId,
        },
      ]);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }, 300_000);
});
