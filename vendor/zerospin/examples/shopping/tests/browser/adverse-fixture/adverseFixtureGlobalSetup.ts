import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(fixtureDirectory, '../../../../..');
const fixturePersistencePath = path.join(fixtureDirectory, '.wrangler');
const zerospinExecutable = path.join(
  repositoryRoot,
  'node_modules/.bin/zerospin',
);
const fixtureApiUrl = 'http://127.0.0.1:3035';

let fixtureProcess: ReturnType<typeof spawn> | null = null;
let fixtureOutput = '';
let fixtureStartup: Promise<void> | null = null;
let activeSetupCount = 0;

// oxlint-disable-next-line import/no-default-export -- Vitest globalSetup modules require a default export.
export default async function adverseFixtureGlobalSetup() {
  /*
   * 1. Count both Vitest project/root setup calls against one module-owned fixture.
   * 2. The first call removes fixture state and starts Zerospin from the fixture cwd.
   * 3. Every call awaits the same Wrangler and HTTP readiness promise.
   * 4. Each teardown releases its own count exactly once.
   * 5. The final teardown stops the child and removes only fixture persistence.
   */
  activeSetupCount += 1;
  let didReleaseSetup = false;

  if (fixtureStartup === null) {
    fixtureStartup = (async () => {
      await fs.rm(fixturePersistencePath, { force: true, recursive: true });
      fixtureOutput = '';

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
      fixtureProcess = startedFixtureProcess;

      try {
        // Wrangler's listening line is necessary, but HTTP readiness remains
        // the authority that every Durable Object binding is usable.
        await new Promise<void>((resolve, reject) => {
          let didSettleWranglerReadiness = false;
          const wranglerReadinessTimeout = setTimeout(() => {
            if (didSettleWranglerReadiness) {
              return;
            }
            didSettleWranglerReadiness = true;
            reject(
              new Error(
                `Adverse fixture did not print Wrangler readiness.\n${fixtureOutput}`,
              ),
            );
          }, 120_000);

          startedFixtureProcess.stdout?.on('data', chunk => {
            fixtureOutput = `${fixtureOutput}${String(chunk)}`.slice(-32_768);
            if (
              !didSettleWranglerReadiness &&
              /Ready on http:\/\/[^\s]+:3035/.test(fixtureOutput)
            ) {
              didSettleWranglerReadiness = true;
              clearTimeout(wranglerReadinessTimeout);
              resolve();
            }
          });
          startedFixtureProcess.stderr?.on('data', chunk => {
            fixtureOutput = `${fixtureOutput}${String(chunk)}`.slice(-32_768);
            if (
              !didSettleWranglerReadiness &&
              /Ready on http:\/\/[^\s]+:3035/.test(fixtureOutput)
            ) {
              didSettleWranglerReadiness = true;
              clearTimeout(wranglerReadinessTimeout);
              resolve();
            }
          });
          startedFixtureProcess.once('error', error => {
            if (didSettleWranglerReadiness) {
              return;
            }
            didSettleWranglerReadiness = true;
            clearTimeout(wranglerReadinessTimeout);
            reject(error);
          });
          startedFixtureProcess.once('close', (code, signal) => {
            if (fixtureProcess === startedFixtureProcess) {
              fixtureProcess = null;
            }
            if (didSettleWranglerReadiness) {
              return;
            }
            didSettleWranglerReadiness = true;
            clearTimeout(wranglerReadinessTimeout);
            reject(
              new Error(
                `Adverse fixture exited before Wrangler readiness (code=${String(code)}, signal=${String(signal)}).\n${fixtureOutput}`,
              ),
            );
          });
        });

        await new Promise<void>((resolve, reject) => {
          let didSettleHttpReadiness = false;
          const httpReadinessTimeout = setTimeout(() => {
            if (didSettleHttpReadiness) {
              return;
            }
            didSettleHttpReadiness = true;
            clearInterval(httpReadinessPoll);
            reject(
              new Error(
                `Adverse fixture did not reach /__zerospin/ready HTTP 204.\n${fixtureOutput}`,
              ),
            );
          }, 120_000);
          const httpReadinessPoll = setInterval(() => {
            if (didSettleHttpReadiness) {
              return;
            }
            if (
              startedFixtureProcess.exitCode !== null ||
              startedFixtureProcess.signalCode !== null
            ) {
              didSettleHttpReadiness = true;
              clearInterval(httpReadinessPoll);
              clearTimeout(httpReadinessTimeout);
              reject(
                new Error(
                  `Adverse fixture exited before HTTP readiness.\n${fixtureOutput}`,
                ),
              );
              return;
            }
            void fetch(`${fixtureApiUrl}/__zerospin/ready`)
              .then(async response => {
                if (didSettleHttpReadiness) {
                  return;
                }
                if (response.status === 204) {
                  didSettleHttpReadiness = true;
                  clearInterval(httpReadinessPoll);
                  clearTimeout(httpReadinessTimeout);
                  resolve();
                  return;
                }
                fixtureOutput =
                  `${fixtureOutput}\n${await response.text()}`.slice(-32_768);
              })
              .catch(() => {
                // The listening message can precede accepted requests. Only
                // the HTTP 204 branch above completes fixture readiness.
              });
          }, 50);
        });
      } catch (error) {
        if (
          startedFixtureProcess.exitCode === null &&
          startedFixtureProcess.signalCode === null
        ) {
          await new Promise<void>(resolve => {
            const forceKill = setTimeout(() => {
              startedFixtureProcess.kill('SIGKILL');
            }, 10_000);
            startedFixtureProcess.once('close', () => {
              clearTimeout(forceKill);
              resolve();
            });
            startedFixtureProcess.kill('SIGTERM');
          });
        }
        if (fixtureProcess === startedFixtureProcess) {
          fixtureProcess = null;
        }
        await fs.rm(fixturePersistencePath, {
          force: true,
          recursive: true,
        });
        throw error;
      }
    })();
  }

  try {
    await fixtureStartup;
  } catch (error) {
    activeSetupCount -= 1;
    if (activeSetupCount === 0) {
      fixtureStartup = null;
      fixtureProcess = null;
      fixtureOutput = '';
    }
    throw error;
  }

  return async () => {
    if (didReleaseSetup) {
      return;
    }
    didReleaseSetup = true;
    activeSetupCount -= 1;
    if (activeSetupCount !== 0) {
      return;
    }

    const runningFixtureProcess = fixtureProcess;
    fixtureProcess = null;
    fixtureStartup = null;
    fixtureOutput = '';
    if (
      runningFixtureProcess !== null &&
      runningFixtureProcess.exitCode === null &&
      runningFixtureProcess.signalCode === null
    ) {
      await new Promise<void>(resolve => {
        const forceKill = setTimeout(() => {
          runningFixtureProcess.kill('SIGKILL');
        }, 10_000);
        runningFixtureProcess.once('close', () => {
          clearTimeout(forceKill);
          resolve();
        });
        runningFixtureProcess.kill('SIGTERM');
      });
    }
    await fs.rm(fixturePersistencePath, { force: true, recursive: true });
  };
}
