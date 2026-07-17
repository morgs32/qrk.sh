/**
 * Global setup for useAgent browser integration tests.
 * Starts the sync e2e worker via wrangler unstable_dev on a fixed port.
 *
 * In vitest browser mode, globalSetup may run multiple times; port reuse
 * avoids starting duplicate workers.
 */
import { execSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { unstable_dev, type Unstable_DevWorker } from 'wrangler';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

// Must match TEST_WORKER_PORT in vitest.playwright.config.ts
export const TEST_WORKER_PORT = 18788;

let worker: Unstable_DevWorker | undefined;
let signalHandlersInstalled = false;

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '0.0.0.0');
  });
}

async function isWorkerReachable(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}`, {
      signal: AbortSignal.timeout(500),
    });
    return response.status >= 100;
  } catch {
    return false;
  }
}

async function waitForReachableWorker(
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isWorkerReachable(port)) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

function killProcessOnPort(port: number): void {
  try {
    const output = execSync(`lsof -ti tcp:${port} 2>/dev/null || true`)
      .toString()
      .trim();
    if (output) {
      for (const pid of output.split('\n').filter(Boolean)) {
        try {
          process.kill(Number(pid), 'SIGKILL');
          console.log(`[setup] Killed stale process ${pid} on port ${port}`);
        } catch {
          // Process may have already exited
        }
      }
    }
  } catch {
    // lsof not available — ignore
  }
}

async function stopWorker() {
  if (worker) {
    console.log('[teardown] Stopping test worker...');
    try {
      await worker.stop();
    } catch (error) {
      console.error('[teardown] Error stopping worker:', error);
      killProcessOnPort(TEST_WORKER_PORT);
    }
    worker = undefined;
  }
}

export async function setup() {
  const portAvailable = await isPortAvailable(TEST_WORKER_PORT);
  if (!portAvailable) {
    if (await waitForReachableWorker(TEST_WORKER_PORT, 2_000)) {
      console.log(
        `[setup] Reusing test worker at http://127.0.0.1:${TEST_WORKER_PORT}`,
      );
      return;
    }

    console.log(
      `[setup] Port ${TEST_WORKER_PORT} in use — killing stale process...`,
    );
    killProcessOnPort(TEST_WORKER_PORT);
    await new Promise(r => setTimeout(r, 500));
  }

  if (!signalHandlersInstalled) {
    signalHandlersInstalled = true;
    const onSignal = () => {
      stopWorker().finally(() => process.exit(1));
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
  }

  console.log('[setup] Starting sync test worker...');
  const workerEntry = path.join(packageRoot, 'e2e/worker.ts');
  const wranglerConfig = path.join(packageRoot, 'wrangler.vitest.jsonc');

  try {
    worker = await unstable_dev(workerEntry, {
      config: wranglerConfig,
      experimental: {
        disableExperimentalWarning: true,
      },
      port: TEST_WORKER_PORT,
      ip: '0.0.0.0',
      persist: false,
      logLevel: 'warn',
    });

    console.log(
      `[setup] Test worker started at http://127.0.0.1:${TEST_WORKER_PORT}`,
    );
  } catch (error) {
    console.error('[setup] Failed to start test worker:', error);
    throw error;
  }
}

export async function teardown() {
  await stopWorker();
}
