import { command, fixture } from '@zerospin/core/fixtures/nodeFixture';
import { describe, expect, it } from 'vitest';

import { BrowserSessionApi } from './BrowserSessionApi.ts';

describe('BrowserSessionApi RPC boundary', () => {
  it('validates complete occurrences and shares ordering across attached capabilities', async () => {
    const { node, sqlite } = await fixture();
    try {
      const first = new BrowserSessionApi(node);
      const second = new BrowserSessionApi(node);
      expect(
        await first.accept({ ...command('bad'), nodeIndex: 45 }),
      ).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'node-command-invalid' },
      });
      const [one, two] = await Promise.all([
        first.accept(command('one')),
        second.accept(command('two')),
      ]);
      expect(one).toMatchObject({ _tag: 'Success', success: { nodeIndex: 1 } });
      expect(two).toMatchObject({ _tag: 'Success', success: { nodeIndex: 2 } });
      expect(
        await second.history({ afterNodeIndex: 0, limit: 1 }),
      ).toMatchObject({ _tag: 'Success', success: [{ id: 'cmd_one' }] });
      expect(
        await second.history({ afterNodeIndex: 0, limit: 201 }),
      ).toMatchObject({ _tag: 'Failure' });
      await first.dispose();
      expect(await first.accept(command('three'))).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'node-tab-detached' },
      });
      expect(await second.accept(command('three'))).toMatchObject({
        _tag: 'Success',
        success: { nodeIndex: 3 },
      });
    } finally {
      sqlite.close();
    }
  });
});
