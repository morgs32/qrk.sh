import { type Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { primitives } from '../models/primitives.ts';

import {
  UnknownCommandSchema,
  type AccountCommandSchema,
  type DeploySeedCommandSchema,
  type UnknownServiceCommandSchema,
} from './CommandSchema.ts';
import type {
  IAccountCommand,
  IDeploySeedCommand,
  IEncodedCommand,
  IServiceCommand,
} from './types.ts';

assert<
  Equals<
    Schema.Schema.Type<typeof AccountCommandSchema>,
    IEncodedCommand<IAccountCommand>
  >
>();

assert<
  Equals<Schema.Schema.Type<typeof UnknownCommandSchema>, IAccountCommand>
>();

assert<
  Equals<
    Schema.Schema.Type<typeof UnknownServiceCommandSchema>,
    IServiceCommand
  >
>();

assert<
  Equals<Schema.Schema.Type<typeof DeploySeedCommandSchema>, IDeploySeedCommand>
>();

primitives.json({
  // @ts-expect-error asymmetric inner schema encoded type
  schema: UnknownCommandSchema,
});
