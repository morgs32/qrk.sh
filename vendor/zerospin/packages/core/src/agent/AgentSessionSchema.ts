import { Schema } from 'effect';

import {
  ActorDbSchema,
  ActorSelection,
} from '../models/make/makeActorDbVersion.ts';

import type { IAgentSessionDefinition } from './types.ts';

/** Validate cold session capabilities without initializing their runtime. */
export const AgentSessionDefinitionSchema =
  Schema.declare<IAgentSessionDefinition>(
    (input): input is IAgentSessionDefinition =>
      typeof input === 'object' &&
      input !== null &&
      'kind' in input &&
      input.kind === 'aggregate' &&
      'systemName' in input &&
      typeof input.systemName === 'string' &&
      'aggregateName' in input &&
      typeof input.aggregateName === 'string' &&
      'aggregateVersion' in input &&
      typeof input.aggregateVersion === 'string' &&
      'actorName' in input &&
      typeof input.actorName === 'string' &&
      'actorVersion' in input &&
      typeof input.actorVersion === 'string' &&
      'sessionName' in input &&
      typeof input.sessionName === 'string' &&
      'claimsSchema' in input &&
      Schema.isSchema(input.claimsSchema) &&
      'models' in input &&
      typeof input.models === 'object' &&
      input.models !== null &&
      'contracts' in input &&
      typeof input.contracts === 'object' &&
      input.contracts !== null &&
      'db' in input &&
      Schema.is(ActorDbSchema)(input.db) &&
      'selections' in input &&
      typeof input.selections === 'object' &&
      input.selections !== null &&
      Object.values(input.selections).every(
        value => value instanceof ActorSelection,
      ) &&
      'capturedSelections' in input &&
      typeof input.capturedSelections === 'object' &&
      input.capturedSelections !== null &&
      'contractBindings' in input &&
      typeof input.contractBindings === 'object' &&
      input.contractBindings !== null,
  );
export const AgentSessionSchema = Schema.declare<
  Readonly<{ definition: IAgentSessionDefinition }>
>(
  (input): input is Readonly<{ definition: IAgentSessionDefinition }> =>
    typeof input === 'object' &&
    input !== null &&
    'definition' in input &&
    Schema.is(AgentSessionDefinitionSchema)(input.definition),
);
