import type { MatchParams } from '@remix-run/route-pattern/match';
import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect, type ManagedRuntime } from 'effect';
import invariant from 'tiny-invariant';

import type { IRepoNameUtils } from './makeRepoNameUtils.js';

/** Sync path-name decode + getInternals run shared by repo utility builders. */
export function wireRepoInternals<
  const PATTERN extends string,
  INTERNALS,
  SERVICES,
  ERROR,
>(props: {
  ctx: DurableObjectState;
  nameUtils: IRepoNameUtils<PATTERN>;
  managedRuntime: ManagedRuntime.ManagedRuntime<SERVICES, never>;
  getInternals: (props: {
    storage: DurableObjectStorage;
    name: string;
    key: MatchParams<PATTERN>;
  }) => Effect.Effect<INTERNALS, ERROR, SERVICES | Async>;
}): INTERNALS {
  const { ctx, getInternals, managedRuntime, nameUtils } = props;
  const name = ctx.id.name;
  invariant(name, 'Durable Object repo must be accessed via getByName');

  const key = Effect.runSync(nameUtils.parseName(name));

  return managedRuntime.runSync(
    getInternals({
      storage: ctx.storage,
      name,
      key,
    }).pipe(Effect.provide(AsyncLive)),
  );
}
