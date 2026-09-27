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
      target.url.endsWith('/__zerospin/node-worker.js'),
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

test('offline browser restart reopens the verified catalog and accepts durable work', async () => {
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
