import { it } from '@effect/vitest';
import { Effect } from 'effect';
import type { YieldWrap } from 'effect/Utils';

import { makeProfilerLayer, Profiler } from './makeProfilerLayer.ts';
import { profile } from './profile.ts';
import './extend-expect/extend-expect.ts';

describe('profile', () => {
  it.layer(makeProfilerLayer())(it => {
    it.effect('should match procedure', () => {
      const fn = profile('helloWorld')(function* (): Generator<
        YieldWrap<Effect.Effect<void>>,
        string,
        never
      > {
        yield* Effect.void;
        return 'Hello, World!';
      });

      return Effect.gen(function* () {
        const profiler = yield* Profiler;
        const result = yield* fn();
        expect(result).toBe('Hello, World!');

        profiler.forceFlush();
        expect(profiler).toMatchProcedure([
          [
            fn,
            {
              results: 'Hello, World!',
            },
          ],
        ]);
      });
    });
  });

  it.layer(makeProfilerLayer())(it => {
    it.effect('should match nested procedure', () => {
      const nestedFn1 = profile('nestedFn1')(function* (
        args: string,
      ): Generator<YieldWrap<Effect.Effect<void>>, string, never> {
        yield* Effect.void;
        return `Hello, nestedFn1! ${args}`;
      });

      const nestedFn2 = profile('nestedFn2')(function* (
        args: string,
      ): Generator<YieldWrap<Effect.Effect<void>>, string, never> {
        yield* Effect.void;
        return `Hello, nestedFn2! ${args}`;
      });

      const nestedFn3 = profile('nestedFn3')(function* (
        args: string,
      ): Generator<YieldWrap<Effect.Effect<void>>, string, never> {
        yield* Effect.void;
        return `Hello, nestedFn3! ${args}`;
      });

      const fn = profile('fn')(function* (): Generator<
        YieldWrap<Effect.Effect<any, never, Profiler>>,
        string,
        never
      > {
        yield* Effect.void;
        yield* nestedFn1('Hello');
        yield* nestedFn2('World');
        yield* nestedFn3('World');
        return 'Hello, World!';
      });

      return Effect.gen(function* () {
        const profiler = yield* Profiler;
        const result = yield* fn();
        expect(result).toBe('Hello, World!');

        profiler.forceFlush();
        expect(profiler).toMatchProcedure([
          [
            fn,
            {
              children: [
                [
                  nestedFn1,
                  {
                    args: ['Hello'],
                    results: 'Hello, nestedFn1! Hello',
                  },
                ],
                [
                  nestedFn2,
                  {
                    args: ['World'],
                    results: 'Hello, nestedFn2! World',
                  },
                ],
              ],
            },
          ],
        ]);

        expect(profiler).not.toMatchProcedure([
          [
            fn,
            {
              children: [[nestedFn2], [nestedFn1]],
              results: 'Hello, World!',
            },
          ],
        ]);

        expect(profiler).not.toMatchProcedure([
          [
            fn,
            {
              children: [[nestedFn1], [nestedFn1]],
              results: 'Hello, World!',
            },
          ],
        ]);

        expect(profiler).toMatchProcedure([
          [
            fn,
            {
              children: [[nestedFn1], [nestedFn3]],
              results: 'Hello, World!',
            },
          ],
        ]);
      });
    });
  });
});
