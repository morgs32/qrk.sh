import { catchZerospinError, makeZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { IAnyServiceActorVersion } from './types.ts';

/** Resolve actor identity across supported service versions, never by latest. */
export function getServiceActorVersion(
  versions: Readonly<
    Record<
      string,
      { actors: Readonly<Record<string, IAnyServiceActorVersion>> }
    >
  >,
  identity: { actorName: string; actorVersion: string },
): IAnyServiceActorVersion {
  let result: IAnyServiceActorVersion | undefined;
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

export const resolveServiceActorVersion = Effect.fn(
  'resolveServiceActorVersion',
)(function* (...args: Parameters<typeof getServiceActorVersion>) {
  return yield* Effect.try({
    try: () => getServiceActorVersion(...args),
    catch: catchZerospinError({ code: 'actor-version-invalid' }),
  });
});
