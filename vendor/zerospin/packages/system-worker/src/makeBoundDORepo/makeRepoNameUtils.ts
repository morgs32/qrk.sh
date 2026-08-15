import type { RoutePattern } from '@remix-run/route-pattern';
import { createHref, type CreateHrefArgs } from '@remix-run/route-pattern/href';
import {
  createMatcher,
  type MatchParams,
} from '@remix-run/route-pattern/match';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import {
  REPO_KEY_DECODE_FAILED,
  REPO_KEY_ENCODE_FAILED,
} from './repoNameErrors.js';

export type IRepoNameUtils<PATTERN extends string> = {
  makeName: (
    ...args: CreateHrefArgs<PATTERN>
  ) => Effect.Effect<
    string,
    ZerospinError<typeof REPO_KEY_ENCODE_FAILED>,
    never
  >;
  parseName: (
    name: string,
  ) => Effect.Effect<
    MatchParams<PATTERN>,
    ZerospinError<typeof REPO_KEY_DECODE_FAILED>,
    never
  >;
};

/** Stable, dashboard-friendly Durable Object names from a path pattern. */
export function makeRepoNameUtils<const PATTERN extends string>(props: {
  abbreviation: string | undefined;
  namePattern: RoutePattern<PATTERN>;
}): IRepoNameUtils<PATTERN> {
  const { abbreviation, namePattern } = props;
  const prefix = abbreviation === undefined ? '' : `${abbreviation}_`;
  const matcher = createMatcher(namePattern);

  const makeName = Effect.fn('makeName')(function* (
    ...args: CreateHrefArgs<PATTERN>
  ) {
    return yield* Effect.try({
      try: () => `${prefix}${createHref(namePattern, ...args).slice(1)}`,
      catch: cause =>
        new ZerospinError({
          code: REPO_KEY_ENCODE_FAILED,
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });
  });

  const parseName = Effect.fn('parseName')(function* (name: string) {
    if (!name.startsWith(prefix)) {
      return yield* new ZerospinError({
        code: REPO_KEY_DECODE_FAILED,
        cause: `Durable Object name "${name}" does not start with exact prefix "${prefix}"`,
      });
    }
    const routeName = name.slice(prefix.length);
    const match = yield* Effect.try({
      try: () => matcher.match(`http://do.invalid/${routeName}`),
      catch: cause =>
        new ZerospinError({
          code: REPO_KEY_DECODE_FAILED,
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });
    if (match === null) {
      return yield* new ZerospinError({
        code: REPO_KEY_DECODE_FAILED,
        cause: `Durable Object name "${name}" does not match namePattern after prefix "${prefix}"`,
      });
    }
    return match.params;
  });

  return { makeName, parseName };
}
