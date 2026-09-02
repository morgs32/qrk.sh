import { Effect } from 'effect';
import * as SQLite from 'wa-sqlite';
import { describe, expect, it, vi } from 'vitest';

import { copySqliteDatabase } from './copySqliteDatabase.ts';

describe('copySqliteDatabase', () => {
  it('copies every page and finishes one successful backup handle exactly once', async () => {
    const backupInit = vi.fn(() => 17);
    const backupStep = vi.fn(() => SQLite.SQLITE_DONE);
    const backupFinish = vi.fn(() => SQLite.SQLITE_OK);
    const free = vi.fn();

    await Effect.runPromise(
      copySqliteDatabase({
        destinationDb: 2,
        module: {
          HEAPU8: new Uint8Array(64),
          pendingOps: [],
          retryOps: [],
          _sqlite3_backup_finish: backupFinish,
          _sqlite3_backup_init: backupInit,
          _sqlite3_backup_step: backupStep,
          _sqlite3_free: free,
          _sqlite3_malloc: () => 8,
        },
        sourceDb: 1,
      }),
    );

    expect(backupInit).toHaveBeenCalledOnce();
    expect(backupInit).toHaveBeenCalledWith(2, 8, 1, 8);
    expect(backupStep).toHaveBeenCalledOnce();
    expect(backupStep).toHaveBeenCalledWith(17, -1);
    expect(backupFinish).toHaveBeenCalledOnce();
    expect(backupFinish).toHaveBeenCalledWith(17);
    expect(free).toHaveBeenCalledOnce();
  });

  it('requires SQLITE_DONE and still finishes the initialized handle exactly once', async () => {
    const backupFinish = vi.fn(() => SQLite.SQLITE_OK);

    await expect(
      Effect.runPromise(
        copySqliteDatabase({
          destinationDb: 2,
          module: {
            HEAPU8: new Uint8Array(64),
            pendingOps: [],
            retryOps: [],
            _sqlite3_backup_finish: backupFinish,
            _sqlite3_backup_init: () => 19,
            _sqlite3_backup_step: () => SQLite.SQLITE_BUSY,
            _sqlite3_free: () => undefined,
            _sqlite3_malloc: () => 8,
          },
          sourceDb: 1,
        }),
      ),
    ).rejects.toThrow(`sqlite3_backup_step failed with code ${SQLite.SQLITE_BUSY}`);
    expect(backupFinish).toHaveBeenCalledOnce();
    expect(backupFinish).toHaveBeenCalledWith(19);
  });
});
