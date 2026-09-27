import type { IAnyAggregates } from '@zerospin/core/aggregate/types';
import { getAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';

/**
 * Resolve the recorded actor version within the named aggregate's supported versions.
 * Materialization follows explicit contract adaptation in this same actor lineage.
 * @bad Read an aggregate-authored contracts map.
 * @bad Search unrelated actors or services after a missing actor contract.
 * @bad Substitute the latest actor for a retained command's actor version.
 */
export function resolveAggregateContract(props: {
  versions: IAnyAggregates;
  command: { actorName: string; actorVersion: string; commandName: string };
}) {
  const actor = getAggregateActorVersion(props.versions, props.command);
  return actor.contracts[props.command.commandName];
}
