/* oxlint-disable eslint/no-restricted-imports -- Test-only layers use Shopping's authored service and command definitions. */
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { DurableObject, env } from 'cloudflare:workers';
import { Effect, Layer, Schema } from 'effect';

import {
  LabelEvidence,
  PaymentEvidence,
  ShoppingProviders,
  TrackingEvidence,
} from '../../src/zerospin/ShoppingProviders';
import { purchaseDeliveryCommand } from '../../src/zerospin/ShoppingPurchaseDelivery';

const Operation = Schema.Literals([
  'payment',
  'label',
  'tracking',
  'transfer-before',
  'transfer-after',
]);
export type IShoppingTestOperation = typeof Operation.Type;
const PaymentInput = Schema.Struct({
  key: Schema.String,
  purchaseId: Schema.optionalKey(Schema.String),
  total: Schema.Number,
});
const LabelInput = Schema.Struct({
  key: Schema.String,
  purchaseId: Schema.optionalKey(Schema.String),
});
const TrackingInput = Schema.Struct({
  key: Schema.String,
  purchaseId: Schema.optionalKey(Schema.String),
  labelReference: Schema.String,
  sequence: Schema.Number,
});
const TransferInput = Schema.fieldsAssign({
  claims: Schema.Struct({ aggregateId: Schema.String }),
})(EncodedAggregateCommandSchema.members[0]);
const Input = Schema.Union([
  PaymentInput,
  TrackingInput,
  TransferInput,
  LabelInput,
]);
const Evidence = Schema.NullOr(
  Schema.Union([PaymentEvidence, LabelEvidence, TrackingEvidence]),
);

export type IShoppingTestObservation = {
  operation: IShoppingTestOperation;
  key: string;
  input: typeof Input.Type;
  inputs: (typeof Input.Type)[];
  evidence: typeof Evidence.Type;
  calls: number;
  effects: number;
  paused: boolean;
};
type IInputRow = {
  operation: string;
  businessKey: string;
  callIndex: number;
  inputKey: string | null;
  purchaseId: string | null;
  total: number | null;
  labelReference: string | null;
  sequence: number | null;
  commandId: string | null;
  commandName: string | null;
  contractVersion: string | null;
  payload: string | null;
  systemName: string | null;
  aggregateName: string | null;
  aggregateVersion: string | null;
  aggregateId: string | null;
  actorName: string | null;
  actorVersion: string | null;
  claims: string | null;
  nodeId: string | null;
  nodeIndex: number | null;
  sessionName: string | null;
};

/** Durable provider evidence and consumed barriers survive instance teardown. */
export class ShoppingTestProvider extends DurableObject<Cloudflare.Env> {
  readonly #waiters = new Map<string, () => void>();

  constructor(ctx: DurableObjectState, workerEnv: Cloudflare.Env) {
    super(ctx, workerEnv);
    ctx.storage.transactionSync(() => {
      ctx.storage.sql.exec(
        'CREATE TABLE IF NOT EXISTS controls (operation TEXT NOT NULL, businessKey TEXT NOT NULL, outcome TEXT NOT NULL, pause INTEGER NOT NULL, PRIMARY KEY (operation, businessKey))',
      );
      ctx.storage.sql.exec(
        'CREATE TABLE IF NOT EXISTS ledger (operation TEXT NOT NULL, businessKey TEXT NOT NULL, evidence TEXT NOT NULL, calls INTEGER NOT NULL, effects INTEGER NOT NULL, PRIMARY KEY (operation, businessKey))',
      );
      ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS inputs (
          operation TEXT NOT NULL, businessKey TEXT NOT NULL, callIndex INTEGER NOT NULL,
          inputKey TEXT, purchaseId TEXT, total REAL, labelReference TEXT, sequence INTEGER,
          commandId TEXT, commandName TEXT, contractVersion TEXT, payload TEXT,
          systemName TEXT, aggregateName TEXT, aggregateVersion TEXT, aggregateId TEXT,
          actorName TEXT, actorVersion TEXT, claims TEXT, nodeId TEXT, nodeIndex INTEGER, sessionName TEXT,
          PRIMARY KEY (operation, businessKey, callIndex)
        )`,
      );
    });
  }

  configure({
    operation,
    key,
    outcome = 'paid',
    pause = false,
  }: {
    operation: IShoppingTestOperation;
    key: string;
    outcome?: 'paid' | 'declined';
    pause?: boolean;
  }) {
    this.ctx.storage.sql.exec(
      'INSERT INTO controls VALUES (?, ?, ?, ?) ON CONFLICT(operation, businessKey) DO UPDATE SET outcome = excluded.outcome, pause = excluded.pause',
      operation,
      key,
      outcome,
      pause ? 1 : 0,
    );
  }

  release({ operation, key }: { operation: IShoppingTestOperation; key: string }) {
    this.#waiters.get(`${operation}:${key}`)?.();
    this.#waiters.delete(`${operation}:${key}`);
  }

  async pay(input: typeof PaymentInput.Type) {
    const configured = this.ctx.storage.sql
      .exec<{ outcome: string }>(
        'SELECT outcome FROM controls WHERE operation = ? AND businessKey = ?',
        'payment',
        input.key,
      )
      .toArray()[0];
    const evidence = {
      key: input.key,
      state: configured?.outcome === 'declined' ? 'declined' : 'paid',
      reference: `payment:${input.key}`,
      evidence: `example-payment:${input.total}:USD`,
    } satisfies typeof PaymentEvidence.Type;
    const observation = this.#record('payment', input.key, input, evidence);
    await this.#pause('payment', input.key, observation.pause);
    return Schema.decodeUnknownSync(Schema.fromJsonString(PaymentEvidence))(
      observation.evidence,
    );
  }

  async createLabel(input: typeof LabelInput.Type) {
    const evidence = {
      key: input.key,
      labelReference: `label:${input.key}`,
      trackingNumber: `DEMO-${input.key}`,
      status: 'pre_transit',
    } satisfies typeof LabelEvidence.Type;
    const observation = this.#record('label', input.key, input, evidence);
    await this.#pause('label', input.key, observation.pause);
    return Schema.decodeUnknownSync(Schema.fromJsonString(LabelEvidence))(
      observation.evidence,
    );
  }

  async refresh(input: typeof TrackingInput.Type) {
    const evidence = {
      key: input.key,
      labelReference: input.labelReference,
      sequence: input.sequence,
      status: input.sequence === 1 ? 'in_transit' : 'delivered',
    } satisfies typeof TrackingEvidence.Type;
    const observation = this.#record('tracking', input.key, input, evidence);
    await this.#pause('tracking', input.key, observation.pause);
    return Schema.decodeUnknownSync(Schema.fromJsonString(TrackingEvidence))(
      observation.evidence,
    );
  }

  async beforeTransfer(input: Parameters<typeof purchaseDeliveryCommand>[0]) {
    const { pause } = this.#record(
      'transfer-before',
      input.quote.purchaseId,
      purchaseDeliveryCommand(input),
      null,
    );
    await this.#pause('transfer-before', input.quote.purchaseId, pause);
  }

  async afterTransfer(input: Parameters<typeof purchaseDeliveryCommand>[0]) {
    const { pause } = this.#record(
      'transfer-after',
      input.quote.purchaseId,
      purchaseDeliveryCommand(input),
      null,
    );
    await this.#pause('transfer-after', input.quote.purchaseId, pause);
  }

  status(): IShoppingTestObservation[] {
    return this.ctx.storage.sql
      .exec<{
        operation: string;
        businessKey: string;
        evidence: string;
        calls: number;
        effects: number;
      }>('SELECT * FROM ledger ORDER BY operation, businessKey')
      .toArray()
      .map(row => {
        const operation = Schema.decodeUnknownSync(Operation)(row.operation);
        const inputs = this.ctx.storage.sql
          .exec<IInputRow>(
            'SELECT * FROM inputs WHERE operation = ? AND businessKey = ? ORDER BY callIndex',
            operation,
            row.businessKey,
          )
          .toArray()
          .map(input => this.#readInput(operation, input));
        const input = inputs[0];
        if (!input) throw new Error('Provider observation has no retained input');
        return {
          operation,
          key: row.businessKey,
          input,
          inputs,
          evidence: Schema.decodeUnknownSync(Schema.fromJsonString(Evidence))(
            row.evidence,
          ),
          calls: row.calls,
          effects: row.effects,
          paused: this.#waiters.has(`${operation}:${row.businessKey}`),
        };
      });
  }

  #record(
    operation: IShoppingTestOperation,
    key: string,
    input: typeof Input.Type,
    evidence: typeof Evidence.Type,
  ) {
    return this.ctx.storage.transactionSync(() => {
      const control = this.ctx.storage.sql
        .exec<{ pause: number }>(
          'SELECT pause FROM controls WHERE operation = ? AND businessKey = ?',
          operation,
          key,
        )
        .toArray()[0];
      this.ctx.storage.sql.exec(
        'UPDATE controls SET pause = 0 WHERE operation = ? AND businessKey = ?',
        operation,
        key,
      );
      this.ctx.storage.sql.exec(
        'INSERT INTO ledger VALUES (?, ?, ?, 1, ?) ON CONFLICT(operation, businessKey) DO UPDATE SET calls = calls + 1',
        operation,
        key,
        JSON.stringify(evidence),
        operation === 'transfer-before' ? 0 : 1,
      );
      const retained = this.ctx.storage.sql
        .exec<{ evidence: string; calls: number }>(
          'SELECT evidence, calls FROM ledger WHERE operation = ? AND businessKey = ?',
          operation,
          key,
        )
        .one();
      this.ctx.storage.sql.exec(
        'INSERT INTO inputs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        operation,
        key,
        retained.calls,
        'key' in input ? input.key : null,
        'purchaseId' in input ? (input.purchaseId ?? null) : null,
        'total' in input ? input.total : null,
        'labelReference' in input ? input.labelReference : null,
        'sequence' in input ? input.sequence : null,
        'id' in input ? input.id : null,
        'commandName' in input ? input.commandName : null,
        'contractVersion' in input ? input.contractVersion : null,
        'payload' in input ? input.payload : null,
        'systemName' in input ? input.systemName : null,
        'aggregateName' in input ? input.aggregateName : null,
        'aggregateVersion' in input ? input.aggregateVersion : null,
        'aggregateId' in input ? input.aggregateId : null,
        'actorName' in input ? input.actorName : null,
        'actorVersion' in input ? input.actorVersion : null,
        'claims' in input ? JSON.stringify(input.claims) : null,
        'nodeId' in input ? input.nodeId : null,
        'nodeIndex' in input ? input.nodeIndex : null,
        'sessionName' in input ? input.sessionName : null,
      );
      return { evidence: retained.evidence, pause: control?.pause === 1 };
    });
  }

  #readInput(operation: IShoppingTestOperation, row: IInputRow) {
    const purchaseId =
      row.purchaseId === null ? {} : { purchaseId: row.purchaseId };
    switch (operation) {
      case 'payment':
        return Schema.decodeUnknownSync(PaymentInput)({
          key: row.inputKey,
          total: row.total,
          ...purchaseId,
        });
      case 'label':
        return Schema.decodeUnknownSync(LabelInput)({
          key: row.inputKey,
          ...purchaseId,
        });
      case 'tracking':
        return Schema.decodeUnknownSync(TrackingInput)({
          key: row.inputKey,
          labelReference: row.labelReference,
          sequence: row.sequence,
          ...purchaseId,
        });
      case 'transfer-before':
      case 'transfer-after':
        return Schema.decodeUnknownSync(TransferInput)({
          id: row.commandId,
          commandName: row.commandName,
          contractVersion: row.contractVersion,
          payload: row.payload,
          systemName: row.systemName,
          aggregateName: row.aggregateName,
          aggregateVersion: row.aggregateVersion,
          aggregateId: row.aggregateId,
          actorName: row.actorName,
          actorVersion: row.actorVersion,
          claims: Schema.decodeUnknownSync(
            Schema.fromJsonString(Schema.Struct({ aggregateId: Schema.String })),
          )(row.claims),
          nodeId: row.nodeId,
          nodeIndex: row.nodeIndex,
          sessionName: row.sessionName,
        });
      default:
        throw new Error(`Unknown Shopping test operation: ${operation}`);
    }
  }

  #pause(operation: IShoppingTestOperation, key: string, pause: boolean) {
    if (!pause) return Promise.resolve();
    return new Promise<void>(resolve => {
      this.#waiters.set(`${operation}:${key}`, resolve);
    });
  }
}

export const ShoppingProvidersLive = Layer.succeed(ShoppingProviders, {
  pay: input =>
    Effect.promise(async () => {
      using evidence = await env.SHOPPING_TEST_PROVIDER.getByName('shopping').pay(
        input,
      );
      return Schema.decodeUnknownSync(PaymentEvidence)(evidence);
    }),
  createLabel: input =>
    Effect.promise(async () => {
      using evidence = await env.SHOPPING_TEST_PROVIDER.getByName(
        'shopping',
      ).createLabel(input);
      return Schema.decodeUnknownSync(LabelEvidence)(evidence);
    }),
  refresh: input =>
    Effect.promise(async () => {
      using evidence = await env.SHOPPING_TEST_PROVIDER.getByName(
        'shopping',
      ).refresh(input);
      return Schema.decodeUnknownSync(TrackingEvidence)(evidence);
    }),
});
