import { describe, expect, it } from '@effect/vitest';
import { RoutePattern } from '@remix-run/route-pattern';
import { Effect } from 'effect';

import { makeRepoNameUtils } from './makeRepoNameUtils.js';
import { REPO_KEY_DECODE_FAILED } from './repoNameErrors.js';

describe('makeRepoNameUtils', () => {
  const { makeName, parseName } = makeRepoNameUtils({
    abbreviation: 'acctrepo',
    namePattern: RoutePattern.parse('/:generationId/:accountId/:accountName'),
  });

  it.effect('round-trips a key through makeName and parseName', () =>
    Effect.gen(function* () {
      const key = {
        generationId: 'gen_test',
        accountId: 'acct_test',
        accountName: 'main',
      };

      const name = yield* makeName(key);
      expect(name).toBe('acctrepo_gen_test/acct_test/main');

      const parsed = yield* parseName(name);
      expect(parsed).toEqual(key);
    }),
  );

  it.effect('percent-encodes a slash within a segment', () =>
    Effect.gen(function* () {
      const key = {
        generationId: 'gen_test',
        accountId: 'acct_test',
        accountName: 'a/b',
      };

      const name = yield* makeName(key);
      expect(name).toBe('acctrepo_gen_test/acct_test/a%2Fb');

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
        const error = yield* Effect.flip(
          parseName('gen_test/acct_test/main'),
        );
        expect(error.code).toBe(REPO_KEY_DECODE_FAILED);
      }),
  );

  it.effect(
    'fails parseName with REPO_KEY_DECODE_FAILED when the prefix is wrong',
    () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseName('actrrepo_gen_test/acct_test/main'),
        );
        expect(error.code).toBe(REPO_KEY_DECODE_FAILED);
      }),
  );
});
