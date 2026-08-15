import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('makeAsyncTx', () => {
  it('rolls back nested and outer storage transactions at their own boundaries', async () => {
    const repo = env.FIXTURE_REPO.getByName(
      'make-async-tx/rollback-boundaries',
    );
    await repo.writeValue({ value: 'before' });

    const inspected = await repo.inspectAsyncTransactionRollback();

    expect(inspected).toEqual({
      nestedFailureCode: 'fixture-nested-transaction-failure',
      valueAfterNestedRollback: 'outer-committed',
      outerFailureCode: 'fixture-outer-transaction-failure',
      valueAfterOuterRollback: 'outer-committed',
    });
  });
});
