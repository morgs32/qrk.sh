import { type Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { primitives } from '../models/primitives.ts';

import {
  UnknownAggregateCommandSchema,
  type DeploySeedCommandSchema,
  type EncodedAggregateCommandSchema,
  type FailedStagedReplicaCommandSchema,
  type FinalizedFailedStagedReplicaCommandSchema,
  type PushBlockSchema,
  type StagedReplicaCommandSchema,
  type StagedSessionCommandSchema,
  type UnknownServiceCommandSchema,
} from './CommandSchema.ts';
import type {
  IAggregateCommand,
  IDeploySeedCommand,
  IEncodedCommand,
  IFailedStagedReplicaCommand,
  IFinalizedFailedStagedReplicaCommand,
  IPushBlock,
  IServiceCommand,
  IStagedReplicaCommand,
  IStagedSessionCommand,
} from './types.ts';

assert<
  Equals<
    Schema.Schema.Type<typeof EncodedAggregateCommandSchema>,
    IEncodedCommand<IAggregateCommand>
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

assert<
  Equals<Schema.Schema.Type<typeof DeploySeedCommandSchema>, IDeploySeedCommand>
>();

assert<
  Equals<
    Schema.Schema.Type<typeof StagedSessionCommandSchema>,
    IEncodedCommand<IStagedSessionCommand>
  >
>();

assert<
  Equals<
    Schema.Schema.Type<typeof StagedReplicaCommandSchema>,
    IEncodedCommand<IStagedReplicaCommand>
  >
>();

assert<
  Equals<
    Schema.Schema.Type<typeof FailedStagedReplicaCommandSchema>,
    IEncodedCommand<IFailedStagedReplicaCommand>
  >
>();

assert<
  Equals<
    Schema.Schema.Type<typeof FinalizedFailedStagedReplicaCommandSchema>,
    IEncodedCommand<IFinalizedFailedStagedReplicaCommand>
  >
>();

assert<Equals<Schema.Schema.Type<typeof PushBlockSchema>, IPushBlock>>();

primitives.json({
  // @ts-expect-error asymmetric inner schema encoded type
  schema: UnknownAggregateCommandSchema,
});
