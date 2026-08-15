import { describe, expect, it } from 'vitest';

import { makeSystemWorkerName } from './makeSystemWorkerName';

describe('makeSystemWorkerName', () => {
  it('combines the exact hosted development routing fields', () => {
    expect(
      makeSystemWorkerName({
        systemId: 'sys_1',
        systemEnvironmentId: 'dev',
        clerkUserId: 'user_1',
      }),
    ).toBe('sys_1:user_1');
  });

  it('uses the system id as the production script name', () => {
    expect(
      makeSystemWorkerName({
        systemId: 'sys_1',
        systemEnvironmentId: 'production',
      }),
    ).toBe('sys_1');
  });

  it('rejects an empty hosted development user id', () => {
    expect(() =>
      makeSystemWorkerName({
        systemId: 'sys_1',
        systemEnvironmentId: 'dev',
        clerkUserId: '',
      }),
    ).toThrow(
      'Hosted development system worker name requires a non-empty clerkUserId.',
    );
  });
});
