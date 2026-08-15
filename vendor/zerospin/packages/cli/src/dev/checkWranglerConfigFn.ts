import type { Async } from '@zerospin/core/async/Async';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { ISystemId } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { loadConfig } from 'c12';
import { Effect, Schema } from 'effect';

const WranglerDevConfigSchema = Schema.Struct({
  compatibility_date: Schema.String,
  compatibility_flags: Schema.Array(Schema.String),
  durable_objects: Schema.Struct({
    bindings: Schema.Array(
      Schema.Struct({
        class_name: Schema.String,
        name: Schema.String,
      }),
    ),
  }),
  migrations: Schema.Array(
    Schema.Struct({
      new_sqlite_classes: Schema.optional(Schema.Array(Schema.String)),
    }),
  ),
  vars: Schema.Struct({
    ZEROSPIN_SYSTEM_ID: makeAbbreviationIdSchema(coreAbbreviations.system),
  }),
  version_metadata: Schema.Struct({
    binding: Schema.Literal('WORKER_VERSION_METADATA'),
  }),
}).pipe(
  Schema.filter(config => [
    /^\d{4}-\d{2}-\d{2}$/.test(config.compatibility_date) &&
    config.compatibility_date >= '2025-11-17'
      ? undefined
      : {
          path: ['compatibility_date'],
          message:
            'must be an ISO date on or after 2025-11-17 so ctx.exports is enabled by default',
        },
    config.compatibility_flags.includes('nodejs_compat')
      ? undefined
      : {
          path: ['compatibility_flags'],
          message: 'must contain nodejs_compat',
        },
    config.compatibility_flags.includes('disable_ctx_exports')
      ? {
          path: ['compatibility_flags'],
          message: 'must not contain disable_ctx_exports',
        }
      : undefined,
    config.durable_objects.bindings.some(
      binding =>
        binding.name === 'SYSTEM_REPO' && binding.class_name === 'SystemRepo',
    )
      ? undefined
      : {
          path: ['durable_objects', 'bindings'],
          message: 'must bind SYSTEM_REPO to SystemRepo',
        },
    config.migrations.some(migration =>
      migration.new_sqlite_classes?.includes('SystemRepo'),
    )
      ? undefined
      : {
          path: ['migrations'],
          message: 'must provision SystemRepo',
        },
  ]),
);

export const checkWranglerConfigFn = Effect.fn('checkWranglerConfigFn')(
  function* (): Effect.fn.Return<ISystemId, IAnyError, Async> {
    const wranglerConfigResult = yield* Effect.tryPromise({
      try: () =>
        loadConfig<Record<string, unknown>>({
          cwd: process.cwd(),
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
          code: 'zerospin-dev-wrangler-config-load-failed',
          message: 'Failed to load wrangler.jsonc for zerospin dev.',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });
    const wranglerConfig = yield* Schema.decodeUnknown(
      WranglerDevConfigSchema,
      {
        onExcessProperty: 'ignore',
      },
    )(wranglerConfigResult.config).pipe(
      Effect.mapError(
        cause =>
          new ZerospinError({
            code: 'zerospin-dev-wrangler-config-invalid',
            message:
              'wrangler.jsonc does not satisfy the Zerospin development contract.',
            cause: cause.message,
          }),
      ),
    );

    return wranglerConfig.vars.ZEROSPIN_SYSTEM_ID;
  },
);
