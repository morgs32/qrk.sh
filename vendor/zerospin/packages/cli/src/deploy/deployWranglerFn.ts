import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import type { Async } from '@zerospin/core/async/Async';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { loadConfig } from 'c12';
import { config as loadEnv } from 'dotenv';
import { Effect, Layer, Schema } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

import { loadSystemFn } from './loadSystemFn.js';
import { loadZerospinConfigFn } from './loadZerospinConfigFn.js';

const require = createRequire(import.meta.url);

/**
 * Deploy the current project directly to the operator's Cloudflare account.
 *
 * This path deliberately has no hosted Zerospin URL or API client. Wrangler is
 * the only deployment boundary, and all credentials belong to this project.
 */
export const deployWranglerFn = Effect.fn('deployWranglerFn')(
  function* (props: { clean: boolean }): Effect.fn.Return<
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
    Async
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
            'Could not resolve Wrangler from the current project. Install wrangler in the project before running zerospin deploy --wrangler.',
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
    const systemId = yield* Schema.decodeUnknown(
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
    const systemPath = path.resolve(cwd, zerospinConfig.entry);
    const emptySeedsPath = yield* Effect.try({
      try: () =>
        require.resolve(
          path.join(path.dirname(productionWorkerPath), 'emptySeeds.js'),
        ),
      catch: cause =>
        new ZerospinError({
          code: 'zerospin-wrangler-empty-seeds-not-found',
          message:
            'Could not resolve the built-in empty seed module for production deployment.',
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
    const rawCompatibilityFlags = wranglerConfig['compatibility_flags'];
    if (
      rawCompatibilityFlags !== undefined &&
      rawCompatibilityFlags !== null &&
      (!Array.isArray(rawCompatibilityFlags) ||
        rawCompatibilityFlags.some(flag => typeof flag !== 'string'))
    ) {
      return yield* new ZerospinError({
        code: 'zerospin-wrangler-config-invalid',
        message:
          'wrangler.jsonc compatibility_flags must be an array of strings when present.',
      });
    }
    const compatibilityFlags = rawCompatibilityFlags ?? [];
    if (compatibilityFlags.includes('disable_ctx_exports')) {
      return yield* new ZerospinError({
        code: 'zerospin-wrangler-config-invalid',
        message:
          'wrangler.jsonc cannot disable ctx.exports because the production lifecycle uses it.',
      });
    }
    const compatibilityFlagsWithoutCtxExports = compatibilityFlags.filter(
      flag => flag !== 'enable_ctx_exports',
    );
    const rawCompatibilityDate = wranglerConfig['compatibility_date'];

    const rawRules = wranglerConfig['rules'];
    if (
      rawRules !== undefined &&
      rawRules !== null &&
      !Array.isArray(rawRules)
    ) {
      return yield* new ZerospinError({
        code: 'zerospin-wrangler-config-invalid',
        message: 'wrangler.jsonc rules must be an array when present.',
      });
    }
    const rules = rawRules ?? [];
    const textRule = rules.find(
      rule =>
        rule !== null &&
        typeof rule === 'object' &&
        !Array.isArray(rule) &&
        Reflect.get(rule, 'type') === 'Text',
    );
    if (textRule !== undefined) {
      const textRuleGlobs = Reflect.get(textRule, 'globs');
      if (
        !Array.isArray(textRuleGlobs) ||
        textRuleGlobs.some(glob => typeof glob !== 'string')
      ) {
        return yield* new ZerospinError({
          code: 'zerospin-wrangler-config-invalid',
          message:
            'wrangler.jsonc Text rules must contain a globs array of strings.',
        });
      }
    }

    const rawMigrations = wranglerConfig['migrations'];
    if (
      rawMigrations !== undefined &&
      rawMigrations !== null &&
      !Array.isArray(rawMigrations)
    ) {
      return yield* new ZerospinError({
        code: 'zerospin-wrangler-config-invalid',
        message: 'wrangler.jsonc migrations must be an array when present.',
      });
    }
    yield* loadSystemFn(
      { ...zerospinConfig, environmentId: 'production' },
      cwd,
    ).pipe(
      Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
    );

    const generatedVars = { ...rawVars };
    Reflect.deleteProperty(generatedVars, 'CLERK_JWT_KEY');
    Reflect.deleteProperty(generatedVars, 'ZEROSPIN_API_URL');
    Reflect.deleteProperty(generatedVars, 'ZEROSPIN_CLEAN_REQUEST_ID');
    Reflect.set(generatedVars, 'ZEROSPIN_SYSTEM_ID', systemId);
    Reflect.set(generatedVars, 'ZEROSPIN_ENVIRONMENT', 'production');
    if (props.clean) {
      Reflect.set(
        generatedVars,
        'ZEROSPIN_CLEAN_REQUEST_ID',
        `cln_${randomUUID()}`,
      );
    }

    const generatedConfig = {
      ...wranglerConfig,
      main: productionWorkerPath,
      alias: {
        ...rawAlias,
        system: systemPath,
        seeds: emptySeedsPath,
      },
      compatibility_flags:
        typeof rawCompatibilityDate === 'string' &&
        rawCompatibilityDate < '2025-11-17'
          ? [...compatibilityFlagsWithoutCtxExports, 'enable_ctx_exports']
          : compatibilityFlagsWithoutCtxExports,
      rules:
        textRule === undefined
          ? [
              {
                type: 'Text',
                globs: ['**/*.sql'],
                fallthrough: true,
              },
              ...rules,
            ]
          : rules.map(rule => {
              if (rule !== textRule) return rule;
              const textRuleGlobs = Reflect.get(textRule, 'globs');
              return {
                ...textRule,
                globs: textRuleGlobs.includes('**/*.sql')
                  ? textRuleGlobs
                  : [...textRuleGlobs, '**/*.sql'],
              };
            }),
      vars: generatedVars,
      version_metadata: {
        binding: 'WORKER_VERSION_METADATA',
      },
    };

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

      return yield* Effect.async<
        Readonly<{ output: string }>,
        ZerospinError<string>
      >((resume, abortSignal) => {
        const child = spawn(
          process.execPath,
          [
            wranglerBinPath,
            'deploy',
            '--config',
            generatedConfigPath,
            '--secrets-file',
            secretsPath,
          ],
          {
            cwd,
            env: wranglerEnvironment,
            stdio: ['inherit', 'pipe', 'pipe'],
          },
        );
        let settled = false;
        let output = '';

        const onAbort = () => {
          child.kill('SIGTERM');
        };
        abortSignal.addEventListener('abort', onAbort, { once: true });
        child.stdout?.on('data', chunk => {
          const text = String(chunk);
          process.stdout.write(text);
          output = `${output}${text}`.slice(-65_536);
        });
        child.stderr?.on('data', chunk => {
          const text = String(chunk);
          process.stderr.write(text);
          output = `${output}${text}`.slice(-65_536);
        });
        child.once('error', cause => {
          if (settled) return;
          settled = true;
          abortSignal.removeEventListener('abort', onAbort);
          resume(
            Effect.fail(
              new ZerospinError({
                code: 'zerospin-wrangler-start-failed',
                message: 'Failed to start Wrangler for production deployment.',
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
            ),
          );
        });
        child.once('close', (code, signal) => {
          if (settled) return;
          settled = true;
          abortSignal.removeEventListener('abort', onAbort);
          if (signal !== null) {
            resume(
              Effect.fail(
                new ZerospinError({
                  code: 'zerospin-wrangler-signaled',
                  message: `Wrangler exited from signal ${signal}.`,
                }),
              ),
            );
            return;
          }
          if (code !== 0) {
            resume(
              Effect.fail(
                new ZerospinError({
                  code: 'zerospin-wrangler-exited',
                  message: `Wrangler exited with code ${code ?? 'unknown'}.`,
                  cause: output.length === 0 ? undefined : output,
                }),
              ),
            );
            return;
          }
          resume(Effect.succeed({ output }));
        });

        return Effect.sync(() => {
          abortSignal.removeEventListener('abort', onAbort);
          if (!child.killed) child.kill('SIGTERM');
        });
      });
    }).pipe(Effect.onInterrupt(() => removeTempDirectory.pipe(Effect.orDie)));

    const deploymentResult = yield* deployment.pipe(Effect.either);
    const cleanupResult = yield* removeTempDirectory.pipe(Effect.either);
    if (deploymentResult._tag === 'Left') {
      return yield* deploymentResult.left;
    }
    if (cleanupResult._tag === 'Left') {
      return yield* cleanupResult.left;
    }

    const workerUrlMatch = deploymentResult.right.output.match(
      /https:\/\/[A-Za-z0-9.-]+\.workers\.dev/,
    );
    const workerUrl = workerUrlMatch?.[0];
    if (workerUrl === undefined) {
      return yield* new ZerospinError({
        code: 'zerospin-wrangler-worker-url-missing',
        message:
          'Wrangler deployed successfully but did not report a workers.dev URL.',
        cause: deploymentResult.right.output,
      });
    }

    let lastFailure: IAnyError | null = null;
    for (let attempt = 1; attempt <= 60; attempt += 1) {
      const readiness = yield* Effect.gen(function* () {
        const encoded = yield* Effect.tryPromise({
          try: async () => {
            using gatewayApi = newSyncRpcSession<GatewayApi>(workerUrl);
            return await gatewayApi.getProductionDeployApi().getReadiness();
          },
          catch: cause =>
            ZerospinError.isZerospinError(cause)
              ? cause
              : new ZerospinError({
                  code: 'zerospin-wrangler-readiness-transport-failed',
                  message:
                    "Failed to request Production Worker readiness over Cap'n Web.",
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
        });
        yield* decodeRpc(encoded);
      }).pipe(Effect.either);
      if (readiness._tag === 'Right') {
        lastFailure = null;
        break;
      }

      lastFailure = readiness.left;
      if (
        readiness.left.code !==
          'zerospin-wrangler-readiness-transport-failed' &&
        readiness.left.code !== 'failed-to-get-readiness-rpc' &&
        readiness.left.code !== 'system-deploy-activating' &&
        readiness.left.code !== 'system-worker-not-active'
      ) {
        return yield* readiness.left;
      }
      if (attempt < 60) {
        yield* Effect.sleep(1_000);
      }
    }
    if (lastFailure !== null) {
      return yield* new ZerospinError({
        code: 'zerospin-wrangler-worker-not-ready',
        message:
          'The production Zerospin Worker did not pass its deployment readiness gate.',
        cause: lastFailure.toString(),
        extra: {
          workerUrl,
          lastFailure: Schema.encodeSync(ZerospinError.schema)(lastFailure),
        },
      });
    }

    return {
      status: 'deployed',
      workerUrl,
      zerospinPublishableKey: configuredPublishableKey,
    };
  },
);
