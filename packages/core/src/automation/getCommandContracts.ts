import type { IAnyAggregateActorVersion } from '../aggregateActor/types.ts';

/** Resolve admitted server provenance without broadening browser-callable contracts. */
export const getCommandContracts = (
  actor: IAnyAggregateActorVersion,
  command: { automationName?: string | null },
) =>
  command.automationName == null
    ? actor.contracts
    : (actor.automations[command.automationName]?.contracts ?? {});
