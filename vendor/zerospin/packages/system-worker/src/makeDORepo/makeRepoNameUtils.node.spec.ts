import { describe, expect, it } from '@effect/vitest';
import { RoutePattern } from '@remix-run/route-pattern';
import { Effect } from 'effect';

import { makeRepoNameUtils } from './makeRepoNameUtils.js';
import { REPO_KEY_DECODE_FAILED } from './repoNameErrors.js';

describe('makeRepoNameUtils', () => {
  const { makeName, parseName } = makeRepoNameUtils({
    abbreviation: 'acctrepo',
    namePattern: RoutePattern.parse('/:systemId/:aggregateId/:aggregateName'),
  });

  it.effect('round-trips a key through makeName and parseName', () =>
    Effect.gen(function* () {
      const key = {
        systemId: 'sys_test',
        aggregateId: 'acct_test',
        aggregateName: 'main',
      };

      const name = yield* makeName(key);
      expect(name).toBe('acctrepo_sys_test/acct_test/main');

      const parsed = yield* parseName(name);
      expect(parsed).toEqual(key);
    }),
  );

  it.effect('percent-encodes a slash within a segment', () =>
    Effect.gen(function* () {
      const key = {
        systemId: 'sys_test',
        aggregateId: 'acct_test',
        aggregateName: 'a/b',
      };

      const name = yield* makeName(key);
      expect(name).toBe('acctrepo_sys_test/acct_test/a%2Fb');

      const parsed = yield* parseName(name);
      expect(parsed).toEqual(key);
    }),
  );

  it.effect(
    'fails parseName with REPO_KEY_DECODE_FAILED when the name has too few segments',
    () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseName('acctrepo_only-two/segments'),
        );
        expect(error.code).toBe(REPO_KEY_DECODE_FAILED);
      }),
  );

  it.effect(
    'fails parseName with REPO_KEY_DECODE_FAILED when the prefix is missing',
    () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseName('sys_test/acct_test/main'));
        expect(error.code).toBe(REPO_KEY_DECODE_FAILED);
      }),
  );

  it.effect(
    'fails parseName with REPO_KEY_DECODE_FAILED when the prefix is wrong',
    () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseName('actrrepo_sys_test/acct_test/main'),
        );
        expect(error.code).toBe(REPO_KEY_DECODE_FAILED);
      }),
  );
});
