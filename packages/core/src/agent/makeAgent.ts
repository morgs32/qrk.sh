import '@zerospin/server-only';
import { Schema } from 'effect';

import type { IAnyAuthoredAggregate } from '../aggregate/types.ts';
import type { IAnyAggregateActorVersion } from '../aggregateActor/types.ts';

import { AgentQuerySchema, type IAgentQuery } from './AgentQuerySchema.ts';

class Agent {
  constructor(
    readonly aggregate: IAnyAuthoredAggregate,
    readonly actor: IAnyAggregateActorVersion,
    readonly query: IAgentQuery,
  ) {}
}
export type IAgent = Agent;
export const AgentSchema = Schema.declare(
  (input: unknown): input is IAgent => input instanceof Agent,
);

export function makeAgent<
  const ACTOR extends IAnyAggregateActorVersion,
>(props: {
  aggregate: IAnyAuthoredAggregate;
  actor: ACTOR;
  query: IAgentQuery & { modelName: keyof ACTOR['db']['models'] & string };
}): IAgent {
  const query = Schema.decodeUnknownSync(AgentQuerySchema)(props.query, {
    onExcessProperty: 'error',
  });
  return new Agent(props.aggregate, props.actor, structuredClone(query));
}
