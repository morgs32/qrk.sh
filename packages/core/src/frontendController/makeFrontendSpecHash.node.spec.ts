import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeFrontendSpecHash } from './makeFrontendSpecHash.ts';

describe('makeFrontendSpecHash', () => {
  it('returns the same hash for recursively reordered object keys', async () => {
    const left = await Effect.runPromise(
      makeFrontendSpecHash({
        frontendName: 'main',
        models: {
          list: {
            version: '1.0.0',
            properties: {
              name: { kind: 'string' },
              id: { kind: 'opaqueId' },
            },
          },
        },
      }),
    );
    const right = await Effect.runPromise(
      makeFrontendSpecHash({
        models: {
          list: {
            properties: {
              id: { kind: 'opaqueId' },
              name: { kind: 'string' },
            },
            version: '1.0.0',
          },
        },
        frontendName: 'main',
      }),
    );

    expect(left).toBe(right);
  });

  it('returns a different hash when a meaningful value changes', async () => {
    const versionOne = await Effect.runPromise(
      makeFrontendSpecHash({
        frontendName: 'main',
        version: '1.0.0',
      }),
    );
    const versionTwo = await Effect.runPromise(
      makeFrontendSpecHash({
        frontendName: 'main',
        version: '2.0.0',
      }),
    );

    expect(versionOne).not.toBe(versionTwo);
  });
});
