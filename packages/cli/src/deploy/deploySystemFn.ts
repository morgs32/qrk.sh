import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import type {
  IDeployConfig,
  ISystem,
  ISystemConfig,
  ISystemEnvironmentId,
} from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Layer } from 'effect';

import type { ICliApis, IDeploySystemResult } from '../types.js';

import { loadSeedsFn } from './loadSeedsFn.js';

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

export type IResult = IDeploySystemResult;

export const deploySystemFn = Effect.fn('deploySystemFn')(function* (props: {
  clean: boolean;
  zerospinSecretKey: string;
  zerospinApiUrl: string;
  compiledSystemWorker: string;
  environmentId: ISystemEnvironmentId;
  system: ISystem;
  config: ISystemConfig;
}): Effect.fn.Return<IResult, IAnyError, Async> {
  const {
    clean,
    zerospinSecretKey,
    zerospinApiUrl,
    compiledSystemWorker,
    environmentId,
    system,
    config: loadedConfig,
  } = props;
  const config = { ...loadedConfig, environmentId };
  const seeds = yield* loadSeedsFn(config).pipe(Effect.provide(platformLayer));
  const seedsLoadedCount = seeds.length;
  const deployConfig: IDeployConfig = {
    environmentId: config.environmentId,
    env: config.env,
    seeds,
  };
  const result = yield* Effect.gen(function* () {
    using apis = newSyncRpcSession<ICliApis>(zerospinApiUrl);
    const cliApi = apis.getCliApi({ zerospinSecretKey });
    return yield* makeAsync(
      () =>
        cliApi.deploySystemWorker({
          clean,
          script: compiledSystemWorker,
          config: deployConfig,
          systemSpec: makeSystemSpec({ system }),
        }),
      cause => makeApiUnreachableError({ zerospinApiUrl, cause }),
    ).pipe(Effect.flatMap(decodeRpc));
  });

  return {
    zerospinApiUrl,
    compiledLength: compiledSystemWorker.length,
    environmentId,
    cloudflareDeploymentId: result.cloudflareDeploymentId,
    seedCommandsFinalized: result.seedCommandsFinalized,
    seedsLoadedCount,
    response: result,
  };
});

function makeApiUnreachableError(props: {
  zerospinApiUrl: string;
  cause: unknown;
}): ZerospinError<'deploy-api-threw-exception'> {
  const { zerospinApiUrl, cause } = props;
  const error = cause instanceof Error ? cause : new Error(String(cause));

  let nestedDetail: string | undefined;
  const nested = error.cause;
  if (nested && typeof nested === 'object') {
    const parts: string[] = [];
    if ('code' in nested && typeof nested.code === 'string') {
      parts.push(nested.code);
    }
    if ('message' in nested && typeof nested.message === 'string') {
      parts.push(nested.message);
    }
    if (parts.length > 0) {
      nestedDetail = parts.join(' ');
    }
  }

  const detail = nestedDetail
    ? `${error.message}: ${nestedDetail}`
    : error.message;

  return new ZerospinError({
    code: 'deploy-api-threw-exception',
    message: `Uncaught exception thrown by Zerospin API at ${zerospinApiUrl} (${detail}).`,
    cause: nestedDetail
      ? `${ZerospinError.prettyUnknownFailure(error)}\nCaused by: ${nestedDetail}`
      : ZerospinError.prettyUnknownFailure(error),
    extra: { zerospinApiUrl },
  });
}
