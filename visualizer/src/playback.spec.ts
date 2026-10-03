import { describe, expect, it } from 'vitest';

import { contracts, scenarios } from './data/scenarios';
import { snapshotAt } from './playback';
import type { IRow, IRows, IScenario } from './types';

function scenario(id: string): IScenario {
  const value = scenarios.find(candidate => candidate.id === id);
  if (value === undefined) throw new Error('Missing scenario: ' + id);
  return value;
}

function at(value: IScenario, stepId: string) {
  const index = value.steps.findIndex(candidate => candidate.id === stepId);
  if (index < 0) throw new Error('Missing step: ' + stepId);
  return snapshotAt(value, index);
}

function row(rows: IRows, tableId: string, index = 0): IRow {
  const value = rows[tableId]?.[index];
  if (value === undefined) {
    throw new Error('Missing row: ' + tableId + '/' + index);
  }
  return value;
}

describe('source-backed cart playback', () => {
  it('reconciles client product data to the owner catalog without mutating its price', () => {
    const value = scenario('cart-success');
    const local = at(value, 'local-stage');
    expect(row(local.rows, 'session/product').price).toBe(1);
    expect(row(local.rows, 'svr/product').price).toBe(20);
    expect(local.rows['node/product']).toEqual([]);
    const committed = at(value, 'owner-commit');
    expect(committed.rows['svr/modelOperations']).toHaveLength(1);
    expect(row(committed.rows, 'svr/modelOperations').modelName).toBe(
      'cartItem',
    );
    const final = at(value, 'browser-reconcile');
    expect(row(final.rows, 'session/product')).toEqual(
      row(final.rows, 'svr/product'),
    );
    expect(row(final.rows, 'session/cartItem').amount).toBe(2);
    expect(row(final.rows, 'node/nodeMetadata').executedHash).toBe(
      row(final.rows, 'node/commands').executedHash,
    );
    expect(value.steps.flatMap(item => item.focus)).not.toContain('aavr');
  });

  it('rolls back all missing-product owner output and later removes browser optimism', () => {
    const value = scenario('cart-missing-product');
    expect(row(at(value, 'local-stage').rows, 'session/product').id).toBe(
      'prd_missing',
    );
    const rejected = at(value, 'owner-commit');
    expect(rejected.rows['svr/modelOperations']).toEqual([]);
    expect(rejected.rows['svr/cartItem']).toEqual([]);
    expect(rejected.rows['svr/product']).toHaveLength(1);
    expect(row(rejected.rows, 'svr/product').id).toBe('prd_one');
    expect(row(rejected.rows, 'svr/commands').execution).toMatchObject({
      status: 'failed',
      failure: { code: 'product-not-found' },
    });
    const final = at(value, 'browser-reconcile');
    expect(final.rows['session/product']).toEqual([]);
    expect(final.rows['session/cartItem']).toEqual([]);
    expect(row(final.rows, 'node/commands').failure).toMatchObject({
      code: 'product-not-found',
    });
    expect(row(final.rows, 'savr/actorState').executedIndex).toBe(1);
  });

  it('cleans acknowledged publication material while chain history remains', () => {
    const value = scenario('cart-success');
    const published = at(value, 'publish-service');
    expect(published.rows['svr/commands']).toEqual([]);
    expect(published.rows['svr/modelOperations']).toEqual([]);
    expect(published.rows['svr/executedCommandOutbox']).toEqual([]);
    expect(published.rows['svc/commands']).toHaveLength(1);
    expect(published.rows['svc/modelOperations']).toHaveLength(1);
  });
});

describe('illustrative purchase on the current async lifecycle', () => {
  it('commits parent output and async authority together before any external work', () => {
    const value = scenario('purchase-paid');
    const committed = at(value, 'parent-commit');
    expect(committed.previousRows['avr/purchase']).toEqual([]);
    expect(committed.previousRows['avr/paymentIntent']).toEqual([]);
    expect(committed.previousRows['avr/asyncOperations']).toEqual([]);
    expect(row(committed.rows, 'avr/purchase').status).toBe('payment-pending');
    expect(row(committed.rows, 'avr/paymentIntent').amountMinor).toBe(4000);
    expect(
      row(committed.rows, 'avr/executedCommandOutbox').execution,
    ).toMatchObject({ status: 'succeeded' });
    expect(committed.rows['avr/executedAggregateCommandOutbox']).toHaveLength(
      1,
    );
    expect(committed.rows['provider/attempts']).toEqual([]);
    expect(committed.rows['ac/commands']).toHaveLength(1);
    const emission = row(committed.rows, 'avr/asyncOperations');
    expect(emission).toMatchObject({
      operationIndex: 3,
      asyncCommandId: 'cmd_complete_01',
      externalRecordedAt: null,
      actorVersion: '2.0.0',
    });
    expect(emission.payload).toEqual({
      paymentIntentId: 'pin_one',
      amountMinor: 4000,
      currency: 'USD',
    });
    expect(
      committed.rows['avr/modelOperations']?.map(item => item.operationIndex),
    ).toEqual([0, 1, 2]);
  });

  it('keeps the parent completion distinct from its private child and public selection', () => {
    const value = scenario('purchase-paid');
    const parentPublished = at(value, 'parent-browser');
    expect(row(parentPublished.rows, 'node/commands').staging).toMatchObject({
      result: { purchaseId: 'pur_one' },
    });
    expect(row(parentPublished.rows, 'aggregate-session/purchase').status).toBe(
      'payment-pending',
    );
    const admitted = at(value, 'child-admission');
    expect(admitted.rows['ac/commands']).toHaveLength(2);
    expect(row(admitted.rows, 'ac/commands', 1)).toMatchObject({
      id: 'cmd_complete_01',
      commandName: 'asyncCompletePurchase',
      aggregateIndex: 2,
      nodeId: null,
      nodeIndex: null,
      sessionName: null,
      claims: { clerkUserId: 'user_alice', aggregateId: 'acct_user_alice' },
      asyncInput: {
        sourceCommandId: 'cmd_purchase_01',
        external: { status: 'paid' },
      },
    });
    const final = at(value, 'final-browser');
    expect(final.rows['node/commands']).toHaveLength(1);
    expect(row(final.rows, 'node/commands')).toMatchObject({
      id: 'cmd_purchase_01',
      executedIndex: 1,
    });
    expect(row(final.rows, 'node/nodeMetadata')).toMatchObject({
      executedIndex: 2,
      outcomeIndex: 1,
    });
    expect(row(final.rows, 'aavc/browserCommands', 1)).toMatchObject({
      completionNodeId: null,
      completionNodeIndex: null,
      completionSessionName: null,
      completionClaims: null,
    });
    expect(row(final.rows, 'aavr/paymentIntent').status).toBe('paid');
    expect(final.rows['aggregate-session/paymentIntent']).toBeUndefined();
    expect(final.rows['node/paymentIntent']).toBeUndefined();
    const publicRows = Object.entries(final.rows).filter(
      ([key]) =>
        key.startsWith('node/') || key.startsWith('aggregate-session/'),
    );
    expect(JSON.stringify(publicRows)).not.toContain('provider_charge_fixture');
    expect(JSON.stringify(publicRows)).not.toContain('asyncInput');
  });

  it('records provider evidence and child publication atomically, then preserves it through acknowledgement', () => {
    const value = scenario('purchase-paid');
    const recorded = at(value, 'record-observation');
    expect(
      row(recorded.previousRows, 'avr/asyncOperations').externalRecordedAt,
    ).toBeNull();
    expect(recorded.previousRows['avr/asyncCommandOutbox']).toEqual([]);
    expect(row(recorded.rows, 'avr/asyncOperations')).toMatchObject({
      externalRecordedAt: expect.any(String),
      nextRunAt: null,
      external: { status: 'paid' },
    });
    expect(row(recorded.rows, 'avr/asyncCommandOutbox')).toMatchObject({
      outboxIndex: 1,
      asyncCommandId: 'cmd_complete_01',
    });
    expect(row(recorded.rows, 'avr/asyncCommandOutboxHead').lastIndex).toBe(1);
    const final = at(value, 'final-browser');
    expect(final.rows['avr/asyncCommandOutbox']).toEqual([]);
    expect(final.rows['avr/executedCommandOutbox']).toEqual([]);
    expect(final.rows['avr/executedAggregateCommandOutbox']).toEqual([]);
    expect(final.rows['avr/modelOperations']).toEqual([]);
    expect(row(final.rows, 'avr/asyncOperations')).toEqual(
      row(recorded.rows, 'avr/asyncOperations'),
    );
    expect(row(final.rows, 'avr/asyncCommandOutboxHead').lastIndex).toBe(1);
    expect(
      row(final.rows, 'avc/asyncOperations').asyncCommandId,
    ).toBeUndefined();
    expect(row(final.rows, 'avc/asyncOperations').external).toBeUndefined();
    expect(row(final.rows, 'aavr/stagedCommands').resolvedAt).toEqual(
      expect.any(String),
    );
  });

  it('uses recorded decline as a business outcome without creating a charge or rerunning production', () => {
    const value = scenario('purchase-declined');
    const final = at(value, 'final-browser');
    expect(final.rows['provider/attempts']).toHaveLength(1);
    expect(final.rows['provider/charges']).toEqual([]);
    expect(row(final.rows, 'avr/asyncOperations').external).toMatchObject({
      status: 'declined',
    });
    expect(row(final.rows, 'aggregate-session/purchase').status).toBe(
      'payment-declined',
    );
    expect(row(final.rows, 'avc/aggregateCommands', 1).execution).toMatchObject(
      { status: 'succeeded', result: { status: 'declined' } },
    );
  });

  it('recovers a lost response with two provider attempts, one charge and unchanged frozen arguments', () => {
    const value = scenario('purchase-retry');
    const lost = at(value, 'provider-call');
    expect(lost.rows['provider/charges']).toHaveLength(1);
    expect(row(lost.rows, 'avr/asyncOperations')).toMatchObject({
      external: null,
      externalRecordedAt: null,
      nextRunAt: expect.any(String),
      lastProducerFailure: { code: 'provider-response-lost' },
    });
    const retried = at(value, 'provider-retry');
    expect(retried.rows['provider/attempts']).toHaveLength(2);
    expect(retried.rows['provider/charges']).toHaveLength(1);
    expect(row(retried.rows, 'avr/asyncOperations').payload).toEqual(
      row(lost.rows, 'avr/asyncOperations').payload,
    );
    expect(row(retried.rows, 'avr/asyncOperations').asyncCommandId).toBe(
      row(lost.rows, 'avr/asyncOperations').asyncCommandId,
    );
    const final = at(value, 'final-browser');
    expect(final.rows['ac/commands']).toHaveLength(2);
    expect(final.rows['provider/charges']).toHaveLength(1);
    expect(row(final.rows, 'aggregate-session/purchase').status).toBe('paid');
  });

  it('replays retained output after reconnect without another provider call or parent completion', () => {
    const value = scenario('purchase-reconnect');
    const replay = at(value, 'reconnect-replay');
    expect(replay.rows).toEqual(replay.previousRows);
    expect(row(replay.rows, 'aggregate-session/purchase').status).toBe(
      'payment-pending',
    );
    expect(row(replay.rows, 'aavr/purchase').status).toBe('paid');
    const final = at(value, 'final-browser');
    expect(row(final.rows, 'aggregate-session/purchase').status).toBe('paid');
    expect(final.rows['provider/attempts']).toHaveLength(1);
    expect(final.rows['provider/charges']).toHaveLength(1);
    expect(final.rows['node/commands']).toHaveLength(1);
    expect(row(final.rows, 'node/nodeMetadata').outcomeIndex).toBe(1);
  });
});

describe('deterministic playback controls', () => {
  it('supports initial state, bounds, reverse steps and arbitrary scrubbing identically', () => {
    for (const value of scenarios) {
      expect(snapshotAt(value, -1).rows).toEqual(value.initialRows);
      expect(snapshotAt(value, -100).stepIndex).toBe(-1);
      expect(snapshotAt(value, Number.NaN).stepIndex).toBe(-1);
      expect(snapshotAt(value, 999).stepIndex).toBe(value.steps.length - 1);
      const forward = value.steps.map((_, index) => snapshotAt(value, index));
      for (let index = value.steps.length - 1; index >= 0; index -= 1) {
        const snapshot = snapshotAt(value, index);
        expect(snapshot.rows).toEqual(forward[index]?.rows);
        expect(snapshot.previousRows).toEqual(
          snapshotAt(value, index - 1).rows,
        );
      }
      const last = snapshotAt(value, value.steps.length - 1);
      row(last.rows, 'node/nodeMetadata').executedIndex = 900;
      expect(
        row(snapshotAt(value, value.steps.length - 1).rows, 'node/nodeMetadata')
          .executedIndex,
      ).not.toBe(900);
    }
  });

  it('labels illustrative contracts and displays readable multiline programs', () => {
    expect(
      contracts.find(value => value.id === 'add-to-cart')?.illustrative,
    ).toBeUndefined();
    expect(contracts.find(value => value.id === 'purchase')?.illustrative).toBe(
      true,
    );
    for (const contract of contracts) expect(contract.program).toContain('\n');
    expect(
      contracts.find(value => value.id === 'mapped-purchase')?.program,
    ).toContain('command.result.purchaseId');
  });
});
