import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import { Effect } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(fixtureDirectory, '../../../../..');
const fixturePersistencePath = path.join(fixtureDirectory, '.wrangler');
const zerospinExecutable = path.join(
  repositoryRoot,
  'node_modules/.bin/zerospin',
);
const fixtureApiUrl = 'http://127.0.0.1:3035';

const fixtureStateKey = Symbol.for(
  '@zerospin/shopping/adverse-fixture-process-state',
);
const fixtureState: {
  process: ReturnType<typeof spawn> | null;
  output: string;
  startup: Promise<void> | null;
  activeSetupCount: number;
} = Reflect.get(process, fixtureStateKey) ?? {
  process: null,
  output: '',
  startup: null,
  activeSetupCount: 0,
};
Reflect.set(process, fixtureStateKey, fixtureState);

export async function stopAdverseFixture(): Promise<void> {
  const runningFixtureProcess = fixtureState.process;
  fixtureState.process = null;
  fixtureState.startup = null;
  fixtureState.output = '';
  if (
    runningFixtureProcess === null ||
    runningFixtureProcess.exitCode !== null ||
    runningFixtureProcess.signalCode !== null
  ) {
    return;
  }

  const runningFixtureChildProcessIds =
    process.platform === 'win32' || runningFixtureProcess.pid === undefined
      ? []
      : await new Promise<number[]>(resolve => {
          const lookup = spawn(
            'pgrep',
            ['-P', String(runningFixtureProcess.pid)],
            { stdio: ['ignore', 'pipe', 'ignore'] },
          );
          let output = '';
          lookup.stdout?.on('data', chunk => {
            output += String(chunk);
          });
          lookup.once('error', () => resolve([]));
          lookup.once('close', () =>
            resolve(
              output
                .trim()
                .split(/\s+/)
                .map(Number)
                .filter(
                  processId => Number.isSafeInteger(processId) && processId > 0,
                ),
            ),
          );
        });

  await new Promise<void>(resolve => {
    const forceKill = setTimeout(() => {
      runningFixtureProcess.kill('SIGKILL');
      for (const processId of runningFixtureChildProcessIds) {
        try {
          process.kill(-processId, 'SIGKILL');
        } catch {
          // The Wrangler process group already exited.
        }
      }
    }, 10_000);
    runningFixtureProcess.once('close', () => {
      clearTimeout(forceKill);
      resolve();
    });
    runningFixtureProcess.kill('SIGTERM');
    for (const processId of runningFixtureChildProcessIds) {
      try {
        process.kill(-processId, 'SIGTERM');
      } catch {
        // The Wrangler process group already exited.
      }
    }
  });
}

export async function startAdverseFixture(
  cleanFixturePersistence = false,
): Promise<void> {
  if (fixtureState.startup !== null) {
    return fixtureState.startup;
  }

  const startup = (async () => {
    if (cleanFixturePersistence) {
      await fs.rm(fixturePersistencePath, { force: true, recursive: true });
    }
    fixtureState.output = '';
    const startedFixtureProcess = spawn(
      zerospinExecutable,
      ['dev', '--port', '3035'],
      {
        cwd: fixtureDirectory,
        env: {
          ...process.env,
          FORCE_COLOR: '0',
          NO_COLOR: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    fixtureState.process = startedFixtureProcess;

    startedFixtureProcess.once('close', () => {
      if (fixtureState.process === startedFixtureProcess) {
        fixtureState.process = null;
        fixtureState.startup = null;
      }
    });

    try {
      // Wrangler's listening line is necessary, but Gateway readiness remains
      // the authority that every Durable Object binding is usable.
      await new Promise<void>((resolve, reject) => {
        let didSettleWranglerReadiness = false;
        const wranglerReadinessTimeout = setTimeout(() => {
          if (didSettleWranglerReadiness) return;
          didSettleWranglerReadiness = true;
          reject(
            new Error(
              `Adverse fixture did not print Wrangler readiness.\n${fixtureState.output}`,
            ),
          );
        }, 120_000);
        const handleOutput = (chunk: unknown) => {
          fixtureState.output = `${fixtureState.output}${String(chunk)}`.slice(
            -32_768,
          );
          if (
            !didSettleWranglerReadiness &&
            /Ready on http:\/\/[^\s]+:3035/.test(fixtureState.output)
          ) {
            didSettleWranglerReadiness = true;
            clearTimeout(wranglerReadinessTimeout);
            resolve();
          }
        };
        startedFixtureProcess.stdout?.on('data', handleOutput);
        startedFixtureProcess.stderr?.on('data', handleOutput);
        startedFixtureProcess.once('error', error => {
          if (didSettleWranglerReadiness) return;
          didSettleWranglerReadiness = true;
          clearTimeout(wranglerReadinessTimeout);
          reject(error);
        });
        startedFixtureProcess.once('close', (code, signal) => {
          if (didSettleWranglerReadiness) return;
          didSettleWranglerReadiness = true;
          clearTimeout(wranglerReadinessTimeout);
          reject(
            new Error(
              `Adverse fixture exited before Wrangler readiness (code=${String(code)}, signal=${String(signal)}).\n${fixtureState.output}`,
            ),
          );
        });
      });

      await new Promise<void>((resolve, reject) => {
        let didSettleGatewayReadiness = false;
        const gatewayReadinessTimeout = setTimeout(() => {
          if (didSettleGatewayReadiness) return;
          didSettleGatewayReadiness = true;
          clearInterval(gatewayReadinessPoll);
          reject(
            new Error(
              `Adverse fixture did not report Gateway readiness.\n${fixtureState.output}`,
            ),
          );
        }, 120_000);
        const gatewayReadinessPoll = setInterval(() => {
          if (didSettleGatewayReadiness) return;
          if (
            startedFixtureProcess.exitCode !== null ||
            startedFixtureProcess.signalCode !== null
          ) {
            didSettleGatewayReadiness = true;
            clearInterval(gatewayReadinessPoll);
            clearTimeout(gatewayReadinessTimeout);
            reject(
              new Error(
                `Adverse fixture exited before Gateway readiness.\n${fixtureState.output}`,
              ),
            );
            return;
          }
          void (async () => {
            using gatewayApi = newSyncRpcSession<GatewayApi>(fixtureApiUrl);
            const devDeployApi = gatewayApi.getDevDeployApi();
            await Effect.runPromise(
              decodeRpc(await devDeployApi.getReadiness()),
            );
          })()
            .then(() => {
              if (didSettleGatewayReadiness) return;
              didSettleGatewayReadiness = true;
              clearInterval(gatewayReadinessPoll);
              clearTimeout(gatewayReadinessTimeout);
              resolve();
            })
            .catch(() => {
              // The listening message can precede accepted requests. Only
              // a decoded DevDeployApi readiness result completes startup.
            });
        }, 50);
      });
    } catch (error) {
      await stopAdverseFixture();
      if (cleanFixturePersistence) {
        await fs.rm(fixturePersistencePath, { force: true, recursive: true });
      }
      throw error;
    }
  })();
  fixtureState.startup = startup;

  return startup;
}

// oxlint-disable-next-line import/no-default-export -- Vitest globalSetup modules require a default export.
export default async function adverseFixtureGlobalSetup() {
  /*
   * 1. Count both Vitest project/root setup calls against one module-owned fixture.
   * 2. The first call removes fixture state and starts Zerospin from the fixture cwd.
   * 3. Every call awaits the same Wrangler and HTTP readiness promise.
   * 4. Each teardown releases its own count exactly once.
   * 5. The final teardown stops the child and removes only fixture persistence.
   */
  fixtureState.activeSetupCount += 1;
  let didReleaseSetup = false;

  try {
    await startAdverseFixture(fixtureState.activeSetupCount === 1);
  } catch (error) {
    fixtureState.activeSetupCount -= 1;
    throw error;
  }

  return async () => {
    if (didReleaseSetup) return;
    didReleaseSetup = true;
    fixtureState.activeSetupCount -= 1;
    if (fixtureState.activeSetupCount !== 0) return;
    await stopAdverseFixture();
    await fs.rm(fixturePersistencePath, { force: true, recursive: true });
  };
}
