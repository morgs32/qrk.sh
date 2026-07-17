import { Schema } from 'effect';

/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded type is invariant; any is intentional for satisfies */
import { DeploySeedCommandSchema } from '../contracts/CommandSchema.ts';

import { SystemEnvironmentIdSchema } from './SystemEnvironmentIdSchema.ts';
import type { IDeployConfig, ISystemConfig } from './types.ts';

const EnvRecord = Schema.Record({
  key: Schema.String,
  value: Schema.String,
});

export const ZerospinConfigSchema = Schema.Struct({
  entry: Schema.String,
  environmentId: Schema.optionalWith(SystemEnvironmentIdSchema, {
    default: () => 'dev',
  }),
  env: Schema.NullOr(EnvRecord),
  seeds: Schema.NullOr(Schema.String),
}) satisfies Schema.Schema<ISystemConfig, any>;

export const DeployConfigSchema = Schema.Struct({
  environmentId: SystemEnvironmentIdSchema,
  env: Schema.NullOr(EnvRecord),
  seeds: Schema.Array(DeploySeedCommandSchema),
}) satisfies Schema.Schema<IDeployConfig, any>;

const _check1: typeof ZerospinConfigSchema.Type = {} as ISystemConfig;
const _check2: ISystemConfig = {} as typeof ZerospinConfigSchema.Type;
const _check3: typeof DeployConfigSchema.Type = {} as IDeployConfig;
const _check4: IDeployConfig = {} as typeof DeployConfigSchema.Type;
void _check1;
void _check2;
void _check3;
void _check4;
