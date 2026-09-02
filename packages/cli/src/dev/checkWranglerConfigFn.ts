import type { Async } from '@zerospin/core/async/Async';
import type { ISystemId } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
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
  exports: Schema.Struct({
    SystemRepo: Schema.Struct({
      type: Schema.Literal('durable-object'),
      storage: Schema.Literal('sqlite'),
    }),
  }),
  vars: Schema.Struct({
    ZEROSPIN_SYSTEM_ID: makeAbbreviationIdSchema(coreAbbreviations.system),
  }),
}).pipe(
  Schema.check(
    Schema.makeFilter(config => {
      const issues: Array<Schema.FilterIssue> = [];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(config.compatibility_date)) {
        issues.push({
          path: ['compatibility_date'],
          issue: 'must be an ISO date in YYYY-MM-DD form',
        });
      }
      if (!config.compatibility_flags.includes('nodejs_compat')) {
        issues.push({
          path: ['compatibility_flags'],
          issue: 'must contain nodejs_compat',
        });
      }
      if (
        !config.durable_objects.bindings.some(
          binding =>
            binding.name === 'SYSTEM_REPO' &&
            binding.class_name === 'SystemRepo',
        )
      ) {
        issues.push({
          path: ['durable_objects', 'bindings'],
          issue: 'must bind SYSTEM_REPO to SystemRepo',
        });
      }
      return issues;
    }),
  ),
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
    const wranglerConfig = yield* Schema.decodeUnknownEffect(
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
