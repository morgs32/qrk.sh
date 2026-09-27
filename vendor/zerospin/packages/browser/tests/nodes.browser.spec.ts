import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type Page } from '@playwright/test';

const controls =
  '/@fs' +
  fileURLToPath(
    new URL('../../fixtures/src/browser/browserControls.ts', import.meta.url),
  );
async function nodeState(page: Page) {
  return page.evaluate(async controls => {
    const { gameEntry } = await import(controls);
    return gameEntry().session.store.getState().nodeState;
  }, controls);
}
async function pause(page: Page, pushPaused: boolean) {
  return page.evaluate(
    async ({ pushPaused, controls }) => {
      const { gameEntry } = await import(controls);
      return gameEntry().setPushPaused({ pushPaused });
    },
    { pushPaused, controls },
  );
}

test('two tabs share committed ordering, pause, outcomes, and durable reload state', async ({
  context,
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Start game', exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  const other = await context.newPage();
  await other.goto('/');
  await expect(
    other.getByRole('button', { name: 'Start game', exact: true }),
  ).toBeEnabled();
  const first = await nodeState(page);
  expect(first.nodeId).toBeTruthy();
  expect((await nodeState(other)).nodeId).toBe(first.nodeId);
  expect(await pause(page, true)).toMatchObject({ _tag: 'Success' });
  await expect.poll(async () => (await nodeState(other)).pushPaused).toBe(true);
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect.poll(async () => (await nodeState(page)).nodeIndex).toBe(1);
  await expect(other.getByRole('heading', { level: 2 })).toHaveText(
    'Your turn',
  );
  expect((await nodeState(other)).outcomeIndex).toBe(0);
  await page.close();
  await other.reload();
  await expect(other.getByRole('heading', { level: 2 })).toHaveText(
    'Your turn',
  );
  expect((await nodeState(other)).nodeId).toBe(first.nodeId);
  expect((await nodeState(other)).pushPaused).toBe(true);
  await pause(other, false);
  await expect
    .poll(async () => (await nodeState(other)).outcomeIndex, { timeout: 30000 })
    .toBe(1);
  expect(errors).toEqual([]);
});

test('a confirmed human move produces a server computer move and survives reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect
    .poll(async () => (await nodeState(page)).outcomeIndex, { timeout: 30000 })
    .toBe(1);
  await page
    .getByRole('button', { name: 'Square 5: empty', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Square 1: O', exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Your turn');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Square 5: X', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Square 1: O', exact: true }),
  ).toBeVisible();
});

test('worker termination restores retained work, manual push preserves pause, and sign-out suspends staging', async ({
  browser,
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Start game', exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await pause(page, true);
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect.poll(async () => (await nodeState(page)).nodeIndex).toBe(1);
  const before = await nodeState(page);
  const cdp = await browser.newBrowserCDPSession();
  const { targetInfos } = await cdp.send('Target.getTargets');
  const worker = targetInfos.find(
    target =>
      target.type === 'shared_worker' &&
      target.url.includes('/zerospin.worker.ts'),
  );
  expect(worker).toBeDefined();
  await cdp.send('Target.closeTarget', { targetId: worker!.targetId });
  await cdp.detach();
  await expect
    .poll(async () => (await nodeState(page)).localAvailability, {
      timeout: 30000,
    })
    .toBe('available');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Your turn');
  expect((await nodeState(page)).nodeId).toBe(before.nodeId);
  expect((await nodeState(page)).pushPaused).toBe(true);
  const manual = await page.evaluate(async controls => {
    const { gameEntry } = await import(controls);
    return gameEntry().pushNow();
  }, controls);
  expect(manual).toMatchObject({
    _tag: 'Success',
    success: { status: 'pushed' },
  });
  await expect
    .poll(async () => (await nodeState(page)).outcomeIndex, { timeout: 30000 })
    .toBe(1);
  expect((await nodeState(page)).pushPaused).toBe(true);
  const history = await page.evaluate(async controls => {
    const { gameEntry } = await import(controls);
    return gameEntry().history({ afterNodeIndex: 0, limit: 50 });
  }, controls);
  expect(history).toMatchObject([{ nodeIndex: 1, executedIndex: 1 }]);
  await page.evaluate(async () => {
    const source = await (await fetch('/src/main.tsx')).text();
    const url = source.match(/from "([^" ]*gameSession\.ts[^" ]*)"/)?.[1];
    if (url === undefined) throw new Error('Session module not found');
    const { gameSession } = await import(url);
    await gameSession.clearAuthentication();
  });
  await expect
    .poll(async () => (await nodeState(page)).authentication)
    .toBe('signed-out');
  expect((await nodeState(page)).blockedWork).toBe(true);
  const retained = await page.evaluate(async controls => {
    const { gameEntry } = await import(controls);
    return gameEntry().history({ afterNodeIndex: 0, limit: 50 });
  }, controls);
  expect(retained).toEqual(history);
  await page.reload();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Your turn');
  expect((await nodeState(page)).nodeId).toBe(before.nodeId);
  expect((await nodeState(page)).authentication).toBe('verified');
});

test('offline browser restart reopens the verified discovery index and accepts durable work', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'zerospin-node-browser-'));
  let context = await chromium.launchPersistentContext(profile, {
    headless: true,
  });
  try {
    let page = context.pages()[0]!;
    await page.goto('http://localhost:3020');
    await expect(
      page.getByRole('button', { name: 'Start game', exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    await pause(page, true);
    const before = await nodeState(page);
    await context.close();
    // A dead proxy blocks the backend, including SharedWorker requests. The app's
    // asset origin bypasses it so this test isolates backend-offline recovery.
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      proxy: {
        server: 'http://127.0.0.1:9',
        bypass: '<-loopback>,localhost:3020',
      },
    });
    page = context.pages()[0]!;
    await page.goto('http://localhost:3020');
    await expect(
      page.getByRole('button', { name: 'Start game', exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    await expect
      .poll(async () => (await nodeState(page)).synchronization)
      .toBe('offline');
    expect((await nodeState(page)).nodeId).toBe(before.nodeId);
    await page.getByRole('button', { name: 'Start game', exact: true }).click();
    await expect.poll(async () => (await nodeState(page)).nodeIndex).toBe(1);
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
    });
    page = context.pages()[0]!;
    await page.goto('http://localhost:3020');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(
      'Your turn',
    );
    expect((await nodeState(page)).nodeId).toBe(before.nodeId);
    await pause(page, false);
    await expect
      .poll(async () => (await nodeState(page)).outcomeIndex, {
        timeout: 30000,
      })
      .toBe(1);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('discovery revisions reject stale authentication and revoke offline lookup', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Start game', exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  const moduleUrl =
    '/@fs' +
    fileURLToPath(new URL('../dist/Node/sessionDiscovery.js', import.meta.url));
  const result = await page.evaluate(async moduleUrl => {
    const { sessionDiscovery } = await import(moduleUrl);
    const databases = await indexedDB.databases();
    const name = databases.find(db => db.name?.endsWith(':discovery'))?.name;
    if (name === undefined) throw new Error('Discovery database is missing');
    const entries = await new Promise<unknown[]>((resolve, reject) => {
      const open = indexedDB.open(name);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const read = db
          .transaction('identities')
          .objectStore('identities')
          .getAll();
        read.onsuccess = () => {
          resolve(read.result);
          db.close();
        };
        read.onerror = () => {
          reject(read.error);
          db.close();
        };
      };
    });
    const entry = entries.find(
      value =>
        typeof value === 'object' && value !== null && 'eligible' in value,
    );
    if (entry === undefined) throw new Error('Identity was not published');
    // Decode the actual persisted entry through the production lookup, not a duplicate test schema.
    const { Schema } = await import(
      '/@fs' +
        moduleUrl.split('/@fs')[1]?.split('/packages/browser/')[0] +
        '/packages/browser/node_modules/effect/dist/index.js'
    );
    const value = Schema.decodeUnknownSync(
      Schema.Struct({
        request: Schema.Unknown,
        claims: Schema.Unknown,
        targetId: Schema.String,
        key: Schema.String,
      }),
    )(entry);
    const revision = await sessionDiscovery.revision();
    await sessionDiscovery.update(
      value.request,
      value.claims,
      value.targetId,
      revision,
      false,
    );
    let stale = false;
    try {
      await sessionDiscovery.update(
        value.request,
        value.claims,
        value.targetId,
        revision,
        true,
      );
    } catch {
      stale = true;
    }
    let offline = false;
    try {
      await sessionDiscovery.find(value.request, value.claims);
    } catch {
      offline = true;
    }
    const next = await sessionDiscovery.revision();
    await sessionDiscovery.update(
      value.request,
      value.claims,
      value.targetId,
      next,
      true,
    );
    const restored = await sessionDiscovery.find(value.request, value.claims);
    const otherLock = structuredClone(value.request);
    otherLock.lock.actorVersion += '-another-lock';
    let oldLockIsolated = false;
    try {
      await sessionDiscovery.find(otherLock, value.claims);
    } catch {
      oldLockIsolated = true;
    }
    await sessionDiscovery.update(
      value.request,
      value.claims,
      value.targetId + '-other-target',
      next,
      true,
    );
    let ambiguous = false;
    try {
      await sessionDiscovery.find(value.request, value.claims);
    } catch {
      ambiguous = true;
    }
    await sessionDiscovery.update(
      value.request,
      value.claims,
      value.targetId + '-other-target',
      next,
      false,
    );
    return {
      oldLockIsolated,
      ambiguous,
      stale,
      offline,
      advanced: next > revision,
      restored: restored.key === value.key,
    };
  }, moduleUrl);
  expect(result).toEqual({
    oldLockIsolated: true,
    ambiguous: true,
    stale: true,
    offline: true,
    advanced: true,
    restored: true,
  });
});

test('different targets own different workers and databases, while logout reaches only matching tabs', async ({
  context,
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Start game', exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  const matching = await context.newPage();
  await matching.goto('/');
  await expect(
    matching.getByRole('button', { name: 'Start game', exact: true }),
  ).toBeEnabled();
  const originalToken = await page.evaluate(() =>
    localStorage.getItem('tic-tac-toe-game'),
  );
  const first = await nodeState(page);
  expect((await nodeState(matching)).nodeId).toBe(first.nodeId);
  await pause(page, true);
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect.poll(async () => (await nodeState(page)).nodeIndex).toBe(1);
  await page.evaluate(() => localStorage.removeItem('tic-tac-toe-game'));
  const other = await context.newPage();
  await other.goto('/');
  await expect(
    other.getByRole('button', { name: 'Start game', exact: true }),
  ).toBeEnabled();
  const second = await nodeState(other);
  expect(second.nodeId).not.toBe(first.nodeId);
  expect(second.nodeIndex).toBe(0);
  expect(
    await page.evaluate(
      async () =>
        (await indexedDB.databases()).filter(db =>
          /^zerospin:[a-f0-9]{64}:[a-f0-9]{64}$/.test(db.name ?? ''),
        ).length,
    ),
  ).toBe(2);
  await page.evaluate(async () => {
    const path = '/src/gameSession.ts';
    const { gameSession } = await import(path);
    await gameSession.clearAuthentication();
  });
  await expect
    .poll(async () => (await nodeState(matching)).authentication)
    .toBe('signed-out');
  expect((await nodeState(other)).authentication).toBe('verified');
  expect((await nodeState(other)).nodeId).toBe(second.nodeId);
  if (originalToken === null) throw new Error('Missing game token');
  await page.evaluate(
    token => localStorage.setItem('tic-tac-toe-game', token),
    originalToken,
  );
  await page.reload();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Your turn');
  await expect
    .poll(async () => (await nodeState(page)).authentication)
    .toBe('verified');
  expect((await nodeState(matching)).authentication).toBe('signed-out');
  const stale = await pause(matching, false);
  expect(stale).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'node-push-state-failed' },
  });
  expect((await nodeState(page)).pushPaused).toBe(true);
});

test('last detach idles the node and reinitialization reuses its persisted identity', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Start game', exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  const before = await nodeState(page);
  await page.evaluate(async () => {
    const path = '/src/gameSession.ts';
    const { gameSession } = await import(path);
    await gameSession.dispose();
  });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Start game', exact: true }),
  ).toBeEnabled();
  expect((await nodeState(page)).nodeId).toBe(before.nodeId);
});

test('offline discovery never recreates a missing node database', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'zerospin-missing-node-'));
  let context = await chromium.launchPersistentContext(profile, {
    headless: true,
  });
  try {
    let page = context.pages()[0]!;
    await page.goto('http://localhost:3020');
    await expect(
      page.getByRole('button', { name: 'Start game', exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      proxy: {
        server: 'http://127.0.0.1:9',
        bypass: '<-loopback>,localhost:3020',
      },
    });
    page = context.pages()[0]!;
    // A same-origin asset document lets us remove storage before the application initializes.
    await page.goto('http://localhost:3020/src/style.css');
    const deleted = await page.evaluate(async () => {
      const names = (await indexedDB.databases())
        .map(db => db.name)
        .filter(
          (name): name is string =>
            name !== undefined &&
            /^zerospin:[a-f0-9]{64}:[a-f0-9]{64}$/.test(name),
        );
      for (const name of names) {
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () =>
            reject(new Error('Node database is still open'));
        });
      }
      return names.length;
    });
    expect(deleted).toBe(1);
    const failure = page.waitForEvent('pageerror');
    await page.goto('http://localhost:3020');
    expect((await failure).message).toContain('Node storage is missing');
    expect(
      await page.evaluate(
        async () =>
          (await indexedDB.databases()).filter(db =>
            /^zerospin:[a-f0-9]{64}:[a-f0-9]{64}$/.test(db.name ?? ''),
          ).length,
      ),
    ).toBe(0);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
