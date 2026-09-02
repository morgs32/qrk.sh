import { type Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import {
  type EncodedAggregateCommandSchema,
  type EncodedServiceCommandSchema,
  type EncodedSessionCommandSchema,
  type UnknownAggregateCommandSchema,
  type UnknownServiceCommandSchema,
} from './CommandSchema.ts';
import type {
  IAggregateCommand,
  IEncodedCommand,
  IServiceCommand,
  ISessionCommand,
} from './types.ts';

assert<
  Equals<
    Schema.Schema.Type<typeof EncodedAggregateCommandSchema>,
    IEncodedCommand<IAggregateCommand>
  >
>();
assert<
  Equals<
    Schema.Schema.Type<typeof EncodedServiceCommandSchema>,
    IEncodedCommand<IServiceCommand>
  >
>();
assert<
  Equals<
    Schema.Schema.Type<typeof EncodedSessionCommandSchema>,
    IEncodedCommand<ISessionCommand>
  >
>();
assert<
  Equals<
    Schema.Schema.Type<typeof UnknownAggregateCommandSchema>,
    IAggregateCommand
  >
>();
assert<
  Equals<
    Schema.Schema.Type<typeof UnknownServiceCommandSchema>,
    IServiceCommand
  >
>();
