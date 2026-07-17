import { describe, expect, it } from 'vitest';

import { makeSystemWorkerName } from './makeSystemWorkerName';

describe('makeSystemWorkerName', () => {
  it('combines the system and hosted development instance identities', () => {
    expect(
      makeSystemWorkerName({
        systemId: 'sys_1',
        instanceId: 'user_1',
      }),
    ).toBe('sys_1:user_1');
  });

  it('uses the production and local instance identities without another environment segment', () => {
    expect(
      makeSystemWorkerName({
        systemId: 'sys_1',
        instanceId: 'production',
      }),
    ).toBe('sys_1:production');
    expect(
      makeSystemWorkerName({
        systemId: 'sys_1',
        instanceId: 'local',
      }),
    ).toBe('sys_1:local');
  });

  it('rejects an empty instance identity', () => {
    expect(() =>
      makeSystemWorkerName({
        systemId: 'sys_1',
        instanceId: '',
      }),
    ).toThrow('System worker name requires a non-empty instanceId.');
  });
});
