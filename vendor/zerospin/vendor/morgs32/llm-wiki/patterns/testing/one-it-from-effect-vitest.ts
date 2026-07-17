import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { beforeEach, describe, expect, vi } from 'vitest';

declare const TestLayer: unknown;
declare const loadRows: () => Effect.Effect<readonly unknown[], never, never>;

/**
 * Import `it` only from `@effect/vitest`; Vitest owns the suite shell.
 *
 * @bad `import { it } from 'vitest'` plus `import { it as effectIt } from '@effect/vitest'`.
 * @bad Using Vitest's `it` for `it.layer` — the Effect runner's `it` is required.
 */
describe('OrderApi.listOrders (worker)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.layer(TestLayer)(scopedIt => {
    scopedIt.effect('returns rows', () =>
      Effect.fn('loadRows')(function* () {
        const rows = yield* loadRows();
        expect(rows).toEqual([]);
      }),
    );
  });
});
