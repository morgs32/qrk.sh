import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(fixtureDirectory, '../../../../..');
const selectorPath = path.join(fixtureDirectory, 'selectedSystem.ts');
const persistencePath = path.join(fixtureDirectory, '.wrangler');
const zerospinExecutable = path.join(
  repositoryRoot,
  'node_modules/.bin/zerospin',
);
const apiUrl = 'http://127.0.0.1:3025';
const controlPort = 3026;

let childProcess: ReturnType<typeof spawn> | null = null;
let childOutput = '';
let controlServer: ReturnType<typeof createServer> | null = null;

function selectorSource(version: string) {
  if (version === 'v1') {
    return (
      "import { transitionSystemV1 } from './version1';\n\n" +
      'export const system = transitionSystemV1;\n'
    );
  }
  if (version === 'v2') {
    return (
      "import { transitionSystemV2 } from './version2';\n\n" +
      'export const system = transitionSystemV2;\n'
    );
  }
  if (version === 'v3') {
    return (
      "import { transitionSystemV3 } from './version3';\n\n" +
      'export const system = transitionSystemV3;\n'
    );
  }
  throw new Error(`Unknown transition fixture version "${version}"`);
}

async function writeSelectedVersion(version: string) {
  await fs.writeFile(selectorPath, selectorSource(version), 'utf8');
}

async function waitForApiReadiness() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120_000) {
    try {
      const response = await fetch(`${apiUrl}/__zerospin/ready`);
      if (response.status === 204) {
        return;
      }
      childOutput = `${childOutput}\n${await response.text()}`.slice(-32_768);
    } catch {
      // The child has printed its listening address, but workerd may still be
      // opening the socket. Readiness remains the HTTP 204 below.
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(
    `Transition fixture did not reach /__zerospin/ready HTTP 204.\n${childOutput}`,
  );
}

async function startSelectedServer(clean: boolean) {
  if (childProcess !== null) {
    throw new Error('Transition fixture server is already running');
  }
  childOutput = '';
  const startedChild = spawn(
    zerospinExecutable,
    clean
      ? ['dev', '--clean', '--port', '3025']
      : ['dev', '--port', '3025'],
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
  childProcess = startedChild;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `Transition fixture did not print Wrangler readiness.\n${childOutput}`,
        ),
      );
    }, 120_000);

    const consumeOutput = (chunk: unknown) => {
      const text = String(chunk);
      childOutput = `${childOutput}${text}`.slice(-32_768);
      if (!settled && /Ready on http:\/\/[^\s]+:3025/.test(childOutput)) {
        settled = true;
        clearTimeout(timeout);
        resolve();
      }
    };
    startedChild.stdout?.on('data', consumeOutput);
    startedChild.stderr?.on('data', consumeOutput);
    startedChild.once('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    startedChild.once('close', (code, signal) => {
      if (childProcess === startedChild) {
        childProcess = null;
      }
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        new Error(
          `Transition fixture exited before readiness (code=${String(code)}, signal=${String(signal)}).\n${childOutput}`,
        ),
      );
    });
  });

  await waitForApiReadiness();
}

async function stopServer() {
  const runningChild = childProcess;
  if (runningChild === null) {
    return;
  }
  await new Promise<void>(resolve => {
    const forceKill = setTimeout(() => runningChild.kill('SIGKILL'), 10_000);
    runningChild.once('close', () => {
      clearTimeout(forceKill);
      if (childProcess === runningChild) {
        childProcess = null;
      }
      resolve();
    });
    runningChild.kill('SIGTERM');
  });

  const stoppedAt = Date.now();
  while (Date.now() - stoppedAt < 30_000) {
    try {
      await fetch(`${apiUrl}/__zerospin/ready`);
    } catch {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Transition fixture API remained reachable after shutdown');
}

async function hotReload(version: string) {
  const runningChild = childProcess;
  if (runningChild === null) {
    throw new Error('Transition fixture server is not running');
  }
  childOutput = '';
  await writeSelectedVersion(version);
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120_000) {
    if (childOutput.includes('Local server updated and ready')) {
      await waitForApiReadiness();
      return;
    }
    if (childProcess !== runningChild) {
      throw new Error(
        `Transition fixture exited during hot reload.\n${childOutput}`,
      );
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(
    `Transition fixture did not report a completed hot reload.\n${childOutput}`,
  );
}

// oxlint-disable-next-line import/no-default-export -- Vitest globalSetup modules require a default export.
export default async function transitionFixtureGlobalSetup() {
  await stopServer();
  await writeSelectedVersion('v1');
  await fs.rm(persistencePath, { force: true, recursive: true });
  try {
    // The first fixture generation must run the configured seeds. Later
    // version restarts deliberately preserve the same local generation state.
    await startSelectedServer(true);

    // Vitest may initialize the same global-setup module for its browser
    // project after the root setup has already run. Reuse this exact control
    // listener instead of attempting to bind 3026 twice in one process.
    if (controlServer === null) {
      controlServer = createServer((request, response) => {
        void (async () => {
          const url = new URL(request.url ?? '/', 'http://127.0.0.1');
          if (request.method === 'GET' && url.pathname === '/state') {
            response.setHeader('content-type', 'application/json');
            response.end(
              JSON.stringify({
                running: childProcess !== null,
                readyUrl: `${apiUrl}/__zerospin/ready`,
              }),
            );
            return;
          }
          if (request.method === 'POST' && url.pathname === '/stop') {
            await stopServer();
            response.statusCode = 204;
            response.end();
            return;
          }
          if (
            request.method === 'POST' &&
            (url.pathname === '/start/v1' ||
              url.pathname === '/start/v2' ||
              url.pathname === '/start/v3')
          ) {
            const version = url.pathname.slice('/start/'.length);
            await stopServer();
            await writeSelectedVersion(version);
            await startSelectedServer(false);
            response.statusCode = 204;
            response.end();
            return;
          }
          if (
            request.method === 'POST' &&
            (url.pathname === '/reload/v1' ||
              url.pathname === '/reload/v2' ||
              url.pathname === '/reload/v3')
          ) {
            const version = url.pathname.slice('/reload/'.length);
            await hotReload(version);
            response.statusCode = 204;
            response.end();
            return;
          }
          response.statusCode = 404;
          response.end('Unknown transition fixture control request');
        })().catch(error => {
          response.statusCode = 500;
          response.setHeader('content-type', 'text/plain');
          response.end(error instanceof Error ? error.stack : String(error));
        });
      });

      const startedControlServer = controlServer;
      await new Promise<void>((resolve, reject) => {
        startedControlServer.once('error', reject);
        startedControlServer.listen(controlPort, '127.0.0.1', resolve);
      });
    }
  } catch (error) {
    const failedControlServer = controlServer;
    controlServer = null;
    if (failedControlServer?.listening === true) {
      await new Promise<void>(resolve =>
        failedControlServer.close(() => resolve()),
      );
    }
    await stopServer();
    await writeSelectedVersion('v1');
    await fs.rm(persistencePath, { force: true, recursive: true });
    throw error;
  }

  return async () => {
    const runningControlServer = controlServer;
    controlServer = null;
    if (runningControlServer?.listening === true) {
      await new Promise<void>(resolve =>
        runningControlServer.close(() => resolve()),
      );
    }
    await stopServer();
    await writeSelectedVersion('v1');
    await fs.rm(persistencePath, { force: true, recursive: true });
  };
}
