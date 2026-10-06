import { Schema } from 'effect';

import { sessionRepoDbConfig } from '../aggregateSession/sessionRepoDbConfig.ts';
import type { IAggregateSessionDefinition } from '../aggregateSession/types.ts';
import {
  ActorDbSchema,
  captureActorSelections,
  type IActorSelections,
  type IAnyActorDbVersion,
  type ISelection,
} from '../models/make/makeActorDbVersion.ts';
import { makeSessionDefinition } from '../sessionDefinition/makeSessionDefinition.ts';

import {
  assertAgentContract,
  type IAnyAgentContracts,
} from './makeAgentContract.ts';
import type { IAgentSessionDefinition } from './types.ts';

const agentCapturedSelections = new WeakSet<object>();

/** System composition accepts only the frozen captures created by this normalizer. */
export function isAgentCapturedSelection(input: unknown): input is ISelection {
  return (
    typeof input === 'object' &&
    input !== null &&
    agentCapturedSelections.has(input)
  );
}

export type IAgentSessionDefinitionProps = Omit<
  IAggregateSessionDefinition,
  'kind' | 'models' | 'modelNames' | 'contracts'
> &
  Readonly<{
    db: IAnyActorDbVersion;
    selections: IActorSelections;
    contracts: IAnyAgentContracts;
  }>;

/** Normalize cold row declarations into the ordinary aggregate session definition. */
export function makeAgentSessionDefinition(
  props: IAgentSessionDefinitionProps,
): IAgentSessionDefinition {
  const { db, selections, contracts, ...sessionProps } = props;
  Schema.decodeUnknownSync(ActorDbSchema)(db);
  for (const modelName of Object.keys(db.models)) {
    if (Object.hasOwn(sessionRepoDbConfig.schema, modelName)) {
      throw new Error(
        `Agent session model ${modelName} conflicts with its command journal`,
      );
    }
  }
  const capturedSelections = Object.freeze(
    captureActorSelections(db, selections, props.claimsSchema),
  );
  for (const [commandName, binding] of Object.entries(contracts)) {
    assertAgentContract(binding);
    if (
      db.models[binding.model.modelName] !== binding.model ||
      capturedSelections[binding.model.modelName]?.model !== binding.model
    ) {
      throw new Error(
        `Agent contract ${commandName} model must be its exact selected database model`,
      );
    }
  }
  const ordinaryContracts = Object.freeze(
    Object.fromEntries(
      Object.entries(contracts).map(([name, binding]) => [
        name,
        binding.contractVersion,
      ]),
    ),
  );
  const definition = makeSessionDefinition({
    ...sessionProps,
    kind: 'aggregate',
    models: db.models,
    contracts: ordinaryContracts,
  });
  if (definition.kind !== 'aggregate') {
    throw new Error('Agent sessions require an aggregate definition');
  }
  for (const selection of Object.values(capturedSelections)) {
    agentCapturedSelections.add(selection);
  }
  return Object.freeze({
    ...definition,
    db,
    contracts: ordinaryContracts,
    selections: Object.freeze({ ...selections }),
    capturedSelections,
    contractBindings: Object.freeze(
      Object.fromEntries(
        Object.entries(contracts).map(([name, binding]) => [
          name,
          Object.freeze({
            model: binding.model,
            bind: Object.freeze({ ...binding.bind }),
          }),
        ]),
      ),
    ),
  });
}
