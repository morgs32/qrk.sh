import type { Async } from '@zerospin/core/async/Async';
import type { ISystemConfig } from '@zerospin/core/system/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { config as loadEnv } from 'dotenv';
import { Effect, Path, type FileSystem } from 'effect';

import { loadZerospinConfigFn } from './loadZerospinConfigFn.js';

export type ILoadConfigResults = {
  zerospinSecretKey: string;
  zerospinApiUrl: string;
  config: ISystemConfig;
};

export const loadConfigFn = Effect.fn('loadConfigFn')(function* (
  cwd: string = process.cwd(),
): Effect.fn.Return<
  ILoadConfigResults,
  IAnyError,
  Async | FileSystem.FileSystem | Path.Path
> {
  const path = yield* Path.Path;
  const envPath = path.join(cwd, '.env');
  const envLocalPath = path.join(cwd, '.env.local');
  yield* Effect.sync(() => {
    loadEnv({ path: envLocalPath });
    loadEnv({ path: envPath });
  });

  const zerospinSecretKey = process.env['ZEROSPIN_SECRET_KEY'];
  if (!zerospinSecretKey) {
    return yield* new ZerospinError({
      code: 'deploy-missing-env',
      message: 'Missing ZEROSPIN_SECRET_KEY env var.',
    });
  }
  const zerospinApiUrl =
    process.env['ZEROSPIN_API_URL'] ?? 'https://api.zerospin.dev';

  const config = yield* loadZerospinConfigFn(cwd);

  const results: ILoadConfigResults = {
    zerospinSecretKey,
    zerospinApiUrl,
    config,
  };

  return results;
});
