import { catchZerospinError, makeZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { IAnyAggregateActorVersion } from './types.ts';

/** Resolve command provenance across supported aggregate versions, never by latest. */
export function getAggregateActorVersion(
  versions: Readonly<
    Record<
      string,
      { actors: Readonly<Record<string, IAnyAggregateActorVersion>> }
    >
  >,
  identity: { actorName: string; actorVersion: string },
): IAnyAggregateActorVersion {
  let result: IAnyAggregateActorVersion | undefined;
  for (const aggregate of Object.values(versions)) {
    const actor = aggregate.actors[identity.actorName];
    if (actor?.version !== identity.actorVersion) continue;
    if (result !== undefined && result !== actor) {
      throw makeZerospinError({
        code: 'actor-version-conflict',
        message: `Conflicting actor ${identity.actorName}@${identity.actorVersion}`,
      });
    }
    result = actor;
  }
  if (result === undefined) {
    throw makeZerospinError({
      code: 'actor-version-unsupported',
      message: `Unsupported actor ${identity.actorName}@${identity.actorVersion}`,
    });
  }
  return result;
}

export const resolveAggregateActorVersion = Effect.fn(
  'resolveAggregateActorVersion',
)(function* (...args: Parameters<typeof getAggregateActorVersion>) {
  return yield* Effect.try({
    try: () => getAggregateActorVersion(...args),
    catch: catchZerospinError({ code: 'actor-version-invalid' }),
  });
});
