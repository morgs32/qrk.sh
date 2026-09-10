/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {} from '@vitest/browser-playwright';
import { backupWorkerPlugin } from '@zerospin/backup-worker/vite';
import { makePlaywrightVitestConfig } from '@zerospin/dev-worker/vitest/makePlaywrightVitestConfig';
import { mergeConfig } from 'vitest/config';
import type { BrowserCommandContext } from 'vitest/node';

import {
  startAdverseFixture,
  stopAdverseFixture,
} from './tests/browser/adverse-fixture/adverseFixtureGlobalSetup';
import type { frontendLifecycleFixture as fixture } from './tests/browser/frontendLifecycleFixture';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
declare const frontendLifecycleFixture: typeof fixture;

export const runFrontendLifecycleAcceptance = async (
  { context: testContext, page }: BrowserCommandContext,
  scenario: 'canceled' | 'independent' | 'frozen',
  run: string,
) => {
  const browser = testContext.browser();
  if (browser === null) {
    throw new Error('Expected Chromium browser');
  }
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  const third = await context.newPage();
  const cdp = await context.newCDPSession(first);
  const url = new URL('/__frontend-lifecycle.html', page.url());
  url.searchParams.set('run', run);
  try {
    if (scenario === 'canceled') {
      url.searchParams.set('visibility', 'hidden');
      await first.goto(url.href);
      await first.waitForFunction(() =>
        Reflect.has(globalThis, 'frontendLifecycleFixture'),
      );
      const hidden = await first.evaluate(() =>
        frontendLifecycleFixture.state(),
      );
      await first.evaluate(() => {
        frontendLifecycleFixture.holdGrants();
        frontendLifecycleFixture.visibility('visible');
      });
      await first.waitForFunction(
        () => frontendLifecycleFixture.state().heldGrants === 2,
      );
      await first.evaluate(() => {
        frontendLifecycleFixture.visibility('hidden');
        frontendLifecycleFixture.visibility('visible');
        frontendLifecycleFixture.releaseGrants();
      });
      await first.evaluate(() => frontendLifecycleFixture.ready());
      const resumed = await first.evaluate(() =>
        frontendLifecycleFixture.state(),
      );
      await first.evaluate(() => {
        frontendLifecycleFixture.focus();
        frontendLifecycleFixture.pageshow();
      });
      await first.waitForFunction(
        count => frontendLifecycleFixture.state().acquisitions > count,
        resumed.acquisitions,
      );
      return {
        hidden,
        resumed,
        repeated: await first.evaluate(() => frontendLifecycleFixture.state()),
      };
    }

    await first.goto(url.href);
    await first.waitForFunction(() =>
      Reflect.has(globalThis, 'frontendLifecycleFixture'),
    );
    await first.evaluate(() => frontendLifecycleFixture.ready());
    const initial = await first.evaluate(() =>
      frontendLifecycleFixture.state(),
    );
    if (scenario === 'independent') {
      url.searchParams.set('selection', 'aggregate');
      await second.goto(url.href);
      await second.waitForFunction(() =>
        Reflect.has(globalThis, 'frontendLifecycleFixture'),
      );
      await second.evaluate(() => frontendLifecycleFixture.ready());
      await first.waitForFunction(
        () =>
          frontendLifecycleFixture.state().aggregate.status === 'superseded',
      );
      const afterAggregate = await first.evaluate(() =>
        frontendLifecycleFixture.state(),
      );
      url.searchParams.set('selection', 'service');
      await third.goto(url.href);
      await third.waitForFunction(() =>
        Reflect.has(globalThis, 'frontendLifecycleFixture'),
      );
      await third.evaluate(() => frontendLifecycleFixture.ready());
      await first.waitForFunction(
        () => frontendLifecycleFixture.state().service.status === 'superseded',
      );
      const afterService = await second.evaluate(() =>
        frontendLifecycleFixture.state(),
      );
      await first.evaluate(() => frontendLifecycleFixture.focus());
      await first.waitForFunction(() => {
        const state = frontendLifecycleFixture.state();
        return (
          state.aggregate.status === 'current' &&
          state.service.status === 'current'
        );
      });
      return {
        initial,
        afterAggregate,
        afterService,
        renewed: await first.evaluate(() => frontendLifecycleFixture.state()),
      };
    }

    const command = await first.evaluate(() =>
      frontendLifecycleFixture.holdLocalCommand(),
    );
    if (command._tag === 'Failure') throw new Error(command.failure.message);
    await first.waitForFunction(
      () => frontendLifecycleFixture.state().heldBatches > 0,
    );
    const previousHadUser = await first.evaluate(() =>
      frontendLifecycleFixture.hasUser(),
    );
    const previousHadCommand = await first.evaluate(
      id => frontendLifecycleFixture.hasCommand(id),
      command.success.id,
    );
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await second.route('http://127.0.0.1:3035/**', route => route.abort());
    await second.goto(url.href);
    await second.waitForFunction(() =>
      Reflect.has(globalThis, 'frontendLifecycleFixture'),
    );
    await second.evaluate(() => frontendLifecycleFixture.ready());
    const successorHadUser = await second.evaluate(() =>
      frontendLifecycleFixture.hasUser(),
    );
    const successorHadCommand = await second.evaluate(
      id => frontendLifecycleFixture.hasCommand(id),
      command.success.id,
    );
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await first.waitForFunction(() => {
      const state = frontendLifecycleFixture.state();
      return (
        state.aggregate.status === 'superseded' &&
        state.service.status === 'superseded'
      );
    });
    const staleOverwrite = await first.evaluate(() =>
      frontendLifecycleFixture.overwriteFromPreviousOwner(),
    );
    await first.evaluate(() => frontendLifecycleFixture.releaseBackup());
    return {
      previousHadUser,
      previousHadCommand,
      successorHadUser,
      successorHadCommand,
      staleOverwrite,
      successorStillHasUser: await second.evaluate(() =>
        frontendLifecycleFixture.hasUser(),
      ),
      successor: await second.evaluate(() => frontendLifecycleFixture.state()),
    };
  } catch (error) {
    for (const fixturePage of [first, second, third]) {
      console.error(
        'Frontend lifecycle acceptance state',
        await fixturePage.evaluate(() =>
          Reflect.has(globalThis, 'frontendLifecycleFixture')
            ? frontendLifecycleFixture.state()
            : 'not loaded',
        ),
      );
    }
    throw error;
  } finally {
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await cdp.detach();
    for (const fixturePage of [first, second, third]) {
      await fixturePage
        .evaluate(async () => {
          if (Reflect.has(globalThis, 'frontendLifecycleFixture')) {
            await frontendLifecycleFixture.close();
          }
        })
        .catch(() => undefined);
      await fixturePage.close();
    }
    await context.close();
  }
};

export default mergeConfig(
  makePlaywrightVitestConfig({
    include: [
      'tests/browser/mainThreadFrontendFlow.playwright.spec.ts',
      'tests/browser/mainThreadBackupAdverse.playwright.spec.ts',
    ],
    packageRoot: __dirname,
  }),
  {
    assetsInclude: ['**/*.wasm'],
    plugins: [
      backupWorkerPlugin(),
      {
        name: 'frontend-lifecycle-acceptance-page',
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            if (request.url?.split('?')[0] !== '/__frontend-lifecycle.html') {
              return next();
            }
            response.setHeader('Content-Type', 'text/html');
            response.end(
              '<!doctype html><script type="module" src="/tests/browser/frontendLifecycleFixture.ts"></script>',
            );
          });
        },
      },
      {
        name: 'qualify-static-emscripten-wasm-assets',
        enforce: 'pre',
        resolveId(id: string) {
          if (id === 'virtual:zerospin-sync-wasm-url') {
            return `\0${id}`;
          }
          return undefined;
        },
        load(id: string) {
          if (id === '\0virtual:zerospin-sync-wasm-url') {
            return `export default ${JSON.stringify(
              `data:application/octet-stream;base64,${readFileSync(
                path.resolve(
                  __dirname,
                  '../../packages/react/dist/wa-sqlite.wasm',
                ),
              ).toString('base64')}`,
            )};`;
          }
          return undefined;
        },
        transform(code: string, id: string) {
          // Vitest's browser server creates a second Vite 8 environment. Its
          // built-in WASM fallback runs before an absolute WASM request can be
          // represented as a URL module, so keep the static URL out of that
          // module graph and point Emscripten directly at Vite's file route.
          if (
            id.endsWith('/@livestore/wa-sqlite/dist/wa-sqlite.mjs') ||
            id.includes('/@livestore/wa-sqlite/dist/wa-sqlite.mjs?') ||
            id.endsWith('/@livestore_wa-sqlite_dist_wa-sqlite__mjs.js') ||
            id.includes('/@livestore_wa-sqlite_dist_wa-sqlite__mjs.js?')
          ) {
            return `import zerospinSyncWasmUrl from 'virtual:zerospin-sync-wasm-url';\n${code.replace(
              /new URL\("[^"]*wa-sqlite\.wasm",\s*import\.meta\.url\)\.href/,
              'zerospinSyncWasmUrl',
            )}`;
          }

          return undefined;
        },
      },
    ],
    define: {
      'process.env': {},
    },
    resolve: {
      alias: [
        {
          find: '@zerospin/backup-worker',
          replacement: path.resolve(
            __dirname,
            '../../packages/backup-worker/dist/index.js',
          ),
        },
      ],
    },
    optimizeDeps: {
      exclude: [
        '@livestore/wa-sqlite',
        '@livestore/wa-sqlite/dist/wa-sqlite.mjs',
      ],
      entries: [
        'tests/browser/mainThreadFrontendFlow.playwright.spec.ts',
        'tests/browser/mainThreadBackupAdverse.playwright.spec.ts',
      ],
    },
    test: {
      fileParallelism: false,
      browser: {
        commands: {
          startAdverseFixture: () => startAdverseFixture(),
          stopAdverseFixture: () => stopAdverseFixture(),
          runFrontendLifecycleAcceptance,
        },
      },
      globalSetup: [
        './tests/browser/adverse-fixture/adverseFixtureGlobalSetup.ts',
      ],
    },
  },
);
