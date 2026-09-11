import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { Effect, Result } from 'effect';
import { describe, expect, it } from 'vitest';

import { assertAcceptedSpec } from './assertAcceptedSpec.js';

describe('accepted spec changes', () => {
  it.each([
    {
      accepted: { nested: { version: '1' } },
      incoming: { nested: { version: '2' } },
      change: { op: 'replace', path: '/nested/version', value: '2' },
    },
    {
      accepted: {},
      incoming: { added: true },
      change: { op: 'add', path: '/added', value: true },
    },
    {
      accepted: { removed: true },
      incoming: {},
      change: { op: 'remove', path: '/removed' },
    },
    {
      accepted: { values: ['a', 'b'] },
      incoming: { values: ['a', 'c'] },
      change: { op: 'replace', path: '/values/1', value: 'c' },
    },
    {
      accepted: { values: ['a'] },
      incoming: { values: ['a', 'b'] },
      change: { op: 'add', path: '/values/1', value: 'b' },
    },
    {
      accepted: { values: ['a', 'b'] },
      incoming: { values: ['a'] },
      change: { op: 'remove', path: '/values/1' },
    },
  ])(
    'preserves $change.op at $change.path through RPC',
    async ({ accepted, incoming, change }) => {
      const envelope = await Effect.runPromise(
        assertAcceptedSpec({
          kind: 'aggregate',
          name: 'cart',
          version: '1.0.0',
          accepted,
          incoming,
        }).pipe(encodeRpc),
      );
      const result = await Effect.runPromise(
        decodeRpc(structuredClone(envelope)).pipe(Effect.result),
      );
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure.code).toBe('aggregate-spec-mismatch');
        expect(result.failure.extra).toEqual({ changes: [change] });
        expect(result.failure.message).toContain(
          JSON.stringify([change], null, 2),
        );
      }
    },
  );
  it('accepts identical definitions regardless of object key order', async () => {
    await expect(
      Effect.runPromise(
        assertAcceptedSpec({
          kind: 'service',
          name: 'directory',
          version: '1',
          accepted: { a: 1, b: [2] },
          incoming: { b: [2], a: 1 },
        }),
      ),
    ).resolves.toBeUndefined();
  });
  it('rejects values that cannot be encoded as JSON', async () => {
    await expect(
      Effect.runPromise(
        assertAcceptedSpec({
          kind: 'service',
          name: 'directory',
          version: '1',
          accepted: {},
          incoming: { value: 1n },
        }),
      ),
    ).rejects.toThrow('JSON-compatible');
  });
});
