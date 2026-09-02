import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import type { Async } from '@zerospin/core/async/Async';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { loadConfig } from 'c12';
import { config as loadEnv } from 'dotenv';
import { Effect, Layer, Schema, Stream } from 'effect';
import {
  ChildProcess,
  type ChildProcessSpawner,
} from 'effect/unstable/process';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

import { loadZerospinConfigFn } from './loadZerospinConfigFn.js';

const require = createRequire(import.meta.url);

/**
 * Deploy the current project directly to the operator's Cloudflare account.
 *
 * This path deliberately has no hosted Zerospin URL or API client. Wrangler is
 * the only deployment boundary, and all credentials belong to this project.
 */
export const deployWranglerFn = Effect.fn('deployWranglerFn')(
  function* (): Effect.fn.Return<
    | Readonly<{
        status: 'keys-generated';
        envFilePath: string;
        zerospinPublishableKey: string;
        zerospinSecretKey: string;
      }>
    | Readonly<{
        status: 'deployed';
        workerUrl: string;
        zerospinPublishableKey: string;
      }>,
    IAnyError,
    Async | ChildProcessSpawner.ChildProcessSpawner
  > {
    const cwd = process.cwd();

    // Local overrides win because dotenv does not replace existing values by
    // default. Nothing in this branch reads ZEROSPIN_API_URL or a hosted token.
    yield* Effect.sync(() => {
      loadEnv({ path: path.join(cwd, '.env.local') });
      loadEnv({ path: path.join(cwd, '.env') });
    });

    const configuredPublishableKey = process.env['ZEROSPIN_PUBLISHABLE_KEY'];
    const configuredSecretKey = process.env['ZEROSPIN_SECRET_KEY'];
    if (!configuredPublishableKey || !configuredSecretKey) {
      return {
        status: 'keys-generated',
        envFilePath: path.join(cwd, '.env.local'),
        zerospinPublishableKey: `pk_live_${randomBytes(32).toString('base64url')}`,
        zerospinSecretKey: `sk_live_${randomBytes(32).toString('base64url')}`,
      };
    }

    const wranglerBinPath = yield* Effect.try({
      try: () => {
        const wranglerPackageJsonPath = require.resolve(
          'wrangler/package.json',
          { paths: [cwd] },
        );
        return path.join(
          path.dirname(wranglerPackageJsonPath),
          'bin',
          'wrangler.js',
        );
      },
      catch: cause =>
        new ZerospinError({
          code: 'zerospin-wrangler-not-found',
          message:
            'Could not resolve Wrangler from the current project. Install wrangler in the project before running zerospin deploy.',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });

    const zerospinConfig = yield* loadZerospinConfigFn(cwd).pipe(
      Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
    );
    const wranglerConfigResult = yield* Effect.tryPromise({
      try: () =>
        loadConfig<Record<string, unknown>>({
          cwd,
          name: 'wrangler',
          configFile: 'wrangler.jsonc',
          configFileRequired: true,
          dotenv: false,
          envName: false,
          rcFile: false,
          packageJson: false,
          giget: false,
          extend: false,
          merger: (highestPriority, main) => highestPriority ?? main ?? {},
        }),
      catch: cause =>
        new ZerospinError({
          code: 'zerospin-wrangler-config-load-failed',
          message: 'Failed to load wrangler.jsonc for production deployment.',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });
    const wranglerConfig = wranglerConfigResult.config;

    const rawVars = wranglerConfig['vars'];
    if (
      rawVars === null ||
      typeof rawVars !== 'object' ||
      Array.isArray(rawVars)
    ) {
      return yield* new ZerospinError({
        code: 'zerospin-wrangler-system-id-missing',
        message: 'wrangler.jsonc vars must contain ZEROSPIN_SYSTEM_ID.',
      });
    }
    const systemId = yield* Schema.decodeUnknownEffect(
      makeAbbreviationIdSchema(coreAbbreviations.system),
    )(Reflect.get(rawVars, 'ZEROSPIN_SYSTEM_ID')).pipe(
      Effect.mapError(
        cause =>
          new ZerospinError({
            code: 'zerospin-wrangler-system-id-missing',
            message:
              'wrangler.jsonc vars.ZEROSPIN_SYSTEM_ID must be a sys_-prefixed id.',
            cause: cause.message,
          }),
      ),
    );

    const productionWorkerPath = yield* Effect.try({
      try: () =>
        require.resolve('@zerospin/production-worker/ProductionWorker'),
      catch: cause =>
        new ZerospinError({
          code: 'zerospin-wrangler-production-worker-not-found',
          message:
            'Could not resolve the Zerospin Production Worker for production deployment.',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });
    const rawAlias = wranglerConfig['alias'];
    if (
      rawAlias !== undefined &&
      rawAlias !== null &&
      (typeof rawAlias !== 'object' || Array.isArray(rawAlias))
    ) {
      return yield* new ZerospinError({
        code: 'zerospin-wrangler-config-invalid',
        message: 'wrangler.jsonc alias must be an object when present.',
      });
    }
    const rawExports = wranglerConfig['exports'];
    if (
      rawExports === null ||
      typeof rawExports !== 'object' ||
      Array.isArray(rawExports)
    ) {
      return yield* new ZerospinError({
        code: 'zerospin-wrangler-config-invalid',
        message: 'wrangler.jsonc exports must declare the Durable Objects.',
      });
    }
    const systemRepoExport = Reflect.get(rawExports, 'SystemRepo');
    if (
      systemRepoExport === null ||
      typeof systemRepoExport !== 'object' ||
      Array.isArray(systemRepoExport) ||
      Reflect.get(systemRepoExport, 'type') !== 'durable-object' ||
      Reflect.get(systemRepoExport, 'storage') !== 'sqlite'
    ) {
      return yield* new ZerospinError({
        code: 'zerospin-wrangler-config-invalid',
        message:
          'wrangler.jsonc exports.SystemRepo must be a live SQLite Durable Object.',
      });
    }
    const generatedVars = { ...rawVars };
    Reflect.deleteProperty(generatedVars, 'CLERK_JWT_KEY');
    Reflect.deleteProperty(generatedVars, 'ZEROSPIN_API_URL');
    Reflect.set(generatedVars, 'ZEROSPIN_SYSTEM_ID', systemId);
    Reflect.set(generatedVars, 'ZEROSPIN_ENVIRONMENT', 'production');

    const generatedAlias = { ...rawAlias };
    Reflect.set(
      generatedAlias,
      'system',
      path.resolve(cwd, zerospinConfig.entry),
    );

    const generatedConfig = {
      ...wranglerConfig,
      main: productionWorkerPath,
      preview_urls: true,
      alias: generatedAlias,
      vars: generatedVars,
    };
    Reflect.deleteProperty(generatedConfig, 'version_metadata');

    const tempDirectory = yield* Effect.tryPromise({
      try: () => fs.mkdtemp(path.join(os.tmpdir(), 'zerospin-wrangler-')),
      catch: cause =>
        new ZerospinError({
          code: 'zerospin-wrangler-temp-directory-failed',
          message: 'Failed to create temporary production deployment files.',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });
    const generatedConfigPath = path.join(tempDirectory, 'wrangler.json');
    const secretsPath = path.join(tempDirectory, 'secrets.json');
    const removeTempDirectory = Effect.tryPromise({
      try: () => fs.rm(tempDirectory, { recursive: true, force: true }),
      catch: cause =>
        new ZerospinError({
          code: 'zerospin-wrangler-temp-directory-remove-failed',
          message: 'Failed to remove temporary production deployment files.',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });

    const deployment = Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () =>
          Promise.all([
            fs.writeFile(
              generatedConfigPath,
              `${JSON.stringify(generatedConfig, null, 2)}\n`,
              { encoding: 'utf8', mode: 0o600 },
            ),
            fs.writeFile(
              secretsPath,
              `${JSON.stringify(
                {
                  ZEROSPIN_PUBLISHABLE_KEY: configuredPublishableKey,
                  ZEROSPIN_SECRET_KEY: configuredSecretKey,
                },
                null,
                2,
              )}\n`,
              { encoding: 'utf8', mode: 0o600 },
            ),
          ]),
        catch: cause =>
          new ZerospinError({
            code: 'zerospin-wrangler-temp-files-write-failed',
            message: 'Failed to write temporary production deployment files.',
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
      });

      // Wrangler inherits the operator's Cloudflare authentication environment,
      // but the strictly production branch removes the generic Zerospin
      // variables before the child process starts. Project secrets reach
      // Cloudflare only through the mode-0600 --secrets-file payload above.
      const wranglerEnvironment = { ...process.env };
      Reflect.deleteProperty(wranglerEnvironment, 'ZEROSPIN_API_URL');
      Reflect.deleteProperty(wranglerEnvironment, 'ZEROSPIN_PUBLISHABLE_KEY');
      Reflect.deleteProperty(wranglerEnvironment, 'ZEROSPIN_SECRET_KEY');
      Reflect.deleteProperty(wranglerEnvironment, 'CLERK_JWT_KEY');

      const uploadResult = yield* Effect.scoped(
        Effect.gen(function* () {
          const wranglerProcess = yield* ChildProcess.make(
            process.execPath,
            [
              wranglerBinPath,
              'versions',
              'upload',
              '--config',
              generatedConfigPath,
              '--secrets-file',
              secretsPath,
            ],
            {
              cwd,
              env: wranglerEnvironment,
              stdin: 'inherit',
              stdout: 'pipe',
              stderr: 'pipe',
            },
          ).pipe(
            Effect.mapError(
              cause =>
                new ZerospinError({
                  code: 'zerospin-wrangler-start-failed',
                  message:
                    'Failed to start Wrangler for the production version upload.',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
            ),
          );

          let output = '';
          const [exitCode] = yield* Effect.all(
            [
              wranglerProcess.exitCode.pipe(
                Effect.mapError(
                  cause =>
                    new ZerospinError({
                      code: 'zerospin-wrangler-signaled',
                      message: 'Wrangler exited before returning an exit code.',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    }),
                ),
              ),
              wranglerProcess.stdout.pipe(
                Stream.decodeText(),
                Stream.runForEach(text =>
                  Effect.sync(() => {
                    process.stdout.write(text);
                    output = `${output}${text}`.slice(-65_536);
                  }),
                ),
              ),
              wranglerProcess.stderr.pipe(
                Stream.decodeText(),
                Stream.runForEach(text =>
                  Effect.sync(() => {
                    process.stderr.write(text);
                    output = `${output}${text}`.slice(-65_536);
                  }),
                ),
              ),
            ],
            { concurrency: 'unbounded' },
          ).pipe(
            Effect.mapError(cause =>
              ZerospinError.isZerospinError(cause)
                ? cause
                : new ZerospinError({
                    code: 'zerospin-wrangler-signaled',
                    message: 'Failed to read Wrangler process output.',
                    cause: ZerospinError.prettyUnknownFailure(cause),
                  }),
            ),
          );

          if (exitCode !== 0) {
            return yield* new ZerospinError({
              code: 'zerospin-wrangler-exited',
              message: `Wrangler version upload exited with code ${exitCode}.`,
              cause: output.length === 0 ? undefined : output,
            });
          }
          return { output };
        }),
      );

      const versionId = uploadResult.output.match(
        /Worker Version ID:\s*([0-9a-f-]{36})/i,
      )?.[1];
      const previewUrl = uploadResult.output.match(
        /Version Preview URL:\s*(https:\/\/\S+)/,
      )?.[1];
      if (versionId === undefined || previewUrl === undefined) {
        return yield* new ZerospinError({
          code: 'zerospin-wrangler-version-output-missing',
          message:
            'Wrangler uploaded the Worker but did not report its version ID and preview URL.',
          cause: uploadResult.output,
        });
      }
      const preview = yield* Effect.try({
        try: () => new URL(previewUrl),
        catch: cause =>
          new ZerospinError({
            code: 'zerospin-wrangler-preview-url-invalid',
            message: 'Wrangler reported an invalid Worker preview URL.',
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
      });
      const workerHostname = preview.hostname.replace(/^[0-9a-f]{8}-/i, '');
      if (workerHostname === preview.hostname) {
        return yield* new ZerospinError({
          code: 'zerospin-wrangler-preview-url-invalid',
          message:
            'Wrangler preview URL did not contain the expected version-qualified Worker hostname.',
          cause: previewUrl,
        });
      }
      const workerUrl = `${preview.protocol}//${workerHostname}`;

      const deployResult = yield* Effect.scoped(
        Effect.gen(function* () {
          const wranglerProcess = yield* ChildProcess.make(
            process.execPath,
            [
              wranglerBinPath,
              'versions',
              'deploy',
              `${versionId}@100%`,
              '--yes',
              '--config',
              generatedConfigPath,
            ],
            {
              cwd,
              env: wranglerEnvironment,
              stdin: 'inherit',
              stdout: 'pipe',
              stderr: 'pipe',
            },
          ).pipe(
            Effect.mapError(
              cause =>
                new ZerospinError({
                  code: 'zerospin-wrangler-start-failed',
                  message:
                    'Failed to start Wrangler for production version deployment.',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
            ),
          );

          let output = '';
          const [exitCode] = yield* Effect.all(
            [
              wranglerProcess.exitCode.pipe(
                Effect.mapError(
                  cause =>
                    new ZerospinError({
                      code: 'zerospin-wrangler-signaled',
                      message: 'Wrangler exited before returning an exit code.',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    }),
                ),
              ),
              wranglerProcess.stdout.pipe(
                Stream.decodeText(),
                Stream.runForEach(text =>
                  Effect.sync(() => {
                    process.stdout.write(text);
                    output = `${output}${text}`.slice(-65_536);
                  }),
                ),
              ),
              wranglerProcess.stderr.pipe(
                Stream.decodeText(),
                Stream.runForEach(text =>
                  Effect.sync(() => {
                    process.stderr.write(text);
                    output = `${output}${text}`.slice(-65_536);
                  }),
                ),
              ),
            ],
            { concurrency: 'unbounded' },
          ).pipe(
            Effect.mapError(cause =>
              ZerospinError.isZerospinError(cause)
                ? cause
                : new ZerospinError({
                    code: 'zerospin-wrangler-signaled',
                    message: 'Failed to read Wrangler process output.',
                    cause: ZerospinError.prettyUnknownFailure(cause),
                  }),
            ),
          );

          if (exitCode !== 0) {
            return yield* new ZerospinError({
              code: 'zerospin-wrangler-exited',
              message: `Wrangler version deployment exited with code ${exitCode}.`,
              cause: output.length === 0 ? undefined : output,
            });
          }
          return { output };
        }),
      );

      yield* Effect.tryPromise({
        try: async () => {
          for (const apiUrl of [previewUrl, workerUrl]) {
            using gatewayApi = newSyncRpcSession<GatewayApi>(apiUrl);
            const systemApi = gatewayApi.getSystemApi({
              zerospinSecretKey: configuredSecretKey,
            });
            const healthcheckResponse = await systemApi.healthcheck({
              traceContext: null,
              args: [],
            });
            await Effect.runPromise(decodeRpc(healthcheckResponse.result));
          }
        },
        catch: cause =>
          ZerospinError.isZerospinError(cause)
            ? cause
            : new ZerospinError({
                code: 'zerospin-deployment-readiness-failed',
                message: 'The deployed Worker did not prove readiness.',
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
      });

      return { workerUrl, output: deployResult.output };
    }).pipe(Effect.onInterrupt(() => removeTempDirectory.pipe(Effect.orDie)));

    const deploymentResult = yield* deployment.pipe(Effect.result);
    const cleanupResult = yield* removeTempDirectory.pipe(Effect.result);
    if (deploymentResult._tag === 'Failure') {
      return yield* deploymentResult.failure;
    }
    if (cleanupResult._tag === 'Failure') {
      return yield* cleanupResult.failure;
    }

    return {
      status: 'deployed',
      workerUrl: deploymentResult.success.workerUrl,
      zerospinPublishableKey: configuredPublishableKey,
    };
  },
);
