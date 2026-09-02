import { describe, expect, it } from 'vitest';

describe('operator reset', () => {
  it('removes only Zerospin locators and disposable OPFS backups', async () => {
    const testRunId = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const authenticationKey = `zerospin:authentication:${testRunId}`;
    const sessionKey = `zerospin:frontend-session:${testRunId}`;
    const unrelatedKey = `unrelated:${testRunId}`;
    const root = await navigator.storage.getDirectory();
    const zerospin = await root.getDirectoryHandle('zerospin', {
      create: true,
    });
    const backupKey = 'f'.repeat(64);
    const backupDirectory = await zerospin.getDirectoryHandle(backupKey, {
      create: true,
    });
    const backupFile = await backupDirectory.getFileHandle(
      `sesn_${testRunId}.sqlite3`,
      { create: true },
    );
    const writable = await backupFile.createWritable();
    await writable.write(new Uint8Array([1, 2, 3]));
    await writable.close();
    const unrelatedDirectoryName = `unrelated-${testRunId}`;
    await root.getDirectoryHandle(unrelatedDirectoryName, { create: true });

    globalThis.localStorage.setItem(authenticationKey, 'authentication');
    globalThis.localStorage.setItem(sessionKey, 'session');
    globalThis.localStorage.setItem(unrelatedKey, 'unrelated');

    try {
      for (
        let index = globalThis.localStorage.length - 1;
        index >= 0;
        index -= 1
      ) {
        const key = globalThis.localStorage.key(index);
        if (
          key?.startsWith('zerospin:authentication:') === true ||
          key?.startsWith('zerospin:frontend-session:') === true
        ) {
          globalThis.localStorage.removeItem(key);
        }
      }
      await root.removeEntry('zerospin', { recursive: true });

      expect(globalThis.localStorage.getItem(authenticationKey)).toBeNull();
      expect(globalThis.localStorage.getItem(sessionKey)).toBeNull();
      expect(globalThis.localStorage.getItem(unrelatedKey)).toBe('unrelated');
      await expect(root.getDirectoryHandle('zerospin')).rejects.toMatchObject({
        name: 'NotFoundError',
      });
      await expect(
        root.getDirectoryHandle(unrelatedDirectoryName),
      ).resolves.toBeDefined();
    } finally {
      globalThis.localStorage.removeItem(authenticationKey);
      globalThis.localStorage.removeItem(sessionKey);
      globalThis.localStorage.removeItem(unrelatedKey);
      await root.removeEntry('zerospin', { recursive: true }).catch(() => {});
      await root.removeEntry(unrelatedDirectoryName, { recursive: true });
    }
  });
});
