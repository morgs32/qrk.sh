import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { applyExecutionDeltaTx } from '@zerospin/core/contracts/applyExecutionDeltaTx';
import {
  AggregateExecutedCommandSchema,
  ServiceExecutedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { encodePayload } from '@zerospin/core/contracts/encodePayload';
import { ExecutionResultSchema } from '@zerospin/core/contracts/ExecutionResultSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import type { IAnyMachineDeclaration } from '@zerospin/core/machine/types';
import { getGraph } from '@zerospin/core/models/getGraph';
import { makeZerospinError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { and, eq, getTableName, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { Effect, Schema } from 'effect';

import { canonicalJson } from './canonicalJson.js';
import type {
  makeMachineDbConfig,
  makeMachineSelectedDbConfig,
} from './machineDbConfig.js';
import type { IRuntimeRoute, IStateRow, IStateValue } from './types.js';
import { validateProgramSuccess } from './validateProgramSuccess.js';

type IDbConfig = ReturnType<typeof makeMachineDbConfig>;
type ISelectedDbConfig = ReturnType<typeof makeMachineSelectedDbConfig>;
type ISourceKind = 'aggregate' | 'service';

const CommandDescriptionSchema = Schema.Struct({
  mode: Schema.Literals(['push', 'execute']),
  binding: Schema.String,
  payload: Schema.Unknown,
  aggregateId: Schema.optionalKey(Schema.String),
  claims: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
});

const commandId = (name: string, revision: number): `cmd_${string}` => {
  const bytes = new TextEncoder().encode(JSON.stringify([name, revision]));
  return `cmd_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
};

/** Entering a State is the only place that computes deadlines and freezes commands. */
export const enterMachineStateTx = Effect.fn('MachineRepo.enterStateTx')(
  function* (props: {
    tx: ITx<IDbConfig>;
    schema: IDbConfig['schema'];
    machine: IAnyMachineDeclaration;
    repoName: string;
    previous: IStateRow;
    origin: IStateValue;
    destination: unknown;
    path: string;
  }) {
    const { tx, machine, previous, origin, destination, path } = props;
    const valid = validateProgramSuccess({
      states: machine.states,
      origin,
      result: destination,
      path,
    });
    const route = machine.routes[valid.value.stateName] as
      | IRuntimeRoute
      | undefined;
    const encoded = yield* Schema.encodeUnknownEffect(
      Schema.toCodecJson(valid.state.schema),
    )(valid.value).pipe(Effect.scoped);
    const revision = previous.revision + 1;
    let wakeAt: number | null = null;
    if (route?.wakeAt !== undefined) {
      wakeAt = route.wakeAt({ origin: valid.value });
      if (!Number.isSafeInteger(wakeAt) || wakeAt < 0) {
        return yield* makeZerospinError('machine-wake-deadline-invalid');
      }
    }
    let commandJson: string | null = null;
    if (route?.command !== undefined) {
      const description = yield* Schema.decodeUnknownEffect(
        CommandDescriptionSchema,
        {
          onExcessProperty: 'error',
        },
      )(route.command({ origin: valid.value }));
      const binding = machine.contracts[description.binding];
      if (binding === undefined) {
        return yield* makeZerospinError('machine-contract-forbidden');
      }
      const aggregateTarget = 'services' in binding.target;
      if (aggregateTarget !== (description.aggregateId !== undefined)) {
        return yield* makeZerospinError('machine-command-target-invalid');
      }
      const payload = yield* encodePayload(binding.contract, {
        version: binding.contract.version,
        payload: description.payload,
      });
      commandJson = canonicalJson({
        id: commandId(props.repoName, revision),
        mode: description.mode,
        binding: description.binding,
        targetKind: aggregateTarget ? 'aggregate' : 'service',
        targetName: binding.target.name,
        targetVersion: binding.target.version,
        aggregateId: description.aggregateId ?? null,
        claims: description.claims ?? {},
        commandName: binding.contract.commandName,
        contractVersion: binding.contract.version,
        payload,
      });
    }
    tx.update(props.schema.machineState)
      .set({
        revision,
        stateName: valid.value.stateName,
        stateJson: canonicalJson(encoded),
        wakeAt,
      })
      .where(eq(props.schema.machineState.id, 1))
      .run();
    tx.update(props.schema.machineOperations)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(props.schema.machineOperations.revision, previous.revision),
          eq(props.schema.machineOperations.kind, 'activation'),
        ),
      )
      .run();
    if (route?.onActivation !== undefined || route?.command !== undefined) {
      tx.insert(props.schema.machineOperations)
        .values({
          id: `mop_${revision}`,
          revision,
          kind: commandJson === null ? 'activation' : 'command',
          status: 'pending',
          failure: null,
          commandJson,
          resultJson: null,
          retryAt: null,
        })
        .run();
    }
    return revision;
  },
);

/** One source occurrence and its State decision share a local transaction. */
export const applyMachineOccurrenceTx = makeTx('MachineRepo.applyOccurrence')(
  function* (
    tx: ITx<IDbConfig>,
    props: {
      machine: IAnyMachineDeclaration;
      schema: IDbConfig['schema'];
      repoName: string;
      sourceKind: ISourceKind;
      selectedSchema: ISelectedDbConfig['schema'];
      selectedDb: Readonly<{ query: unknown }>;
      row: unknown;
      react: boolean;
    },
  ) {
    const { machine, sourceKind, row } = props;
    const retained = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        admission: Schema.String,
        execution: Schema.String,
        serviceIndex: Schema.optionalKey(Schema.Number),
        executedIndex: Schema.optionalKey(Schema.Number),
      }),
    )(row);
    const admission = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(AdmissionResultSchema),
    )(retained.admission);
    const execution = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ExecutionResultSchema),
    )(retained.execution);
    if (typeof row !== 'object' || row === null) {
      return yield* makeZerospinError('machine-source-row-invalid');
    }
    const claims =
      'claims' in row
        ? yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
          )(row.claims)
        : undefined;
    const normalized = {
      ...row,
      admission,
      execution,
      ...(claims === undefined ? {} : { claims }),
    };
    const occurrence =
      'aggregateId' in row
        ? yield* Schema.decodeUnknownEffect(
            Schema.toType(AggregateExecutedCommandSchema),
          )(normalized)
        : yield* Schema.decodeUnknownEffect(
            Schema.toType(ServiceExecutedCommandSchema),
          )(normalized);
    const index =
      sourceKind === 'aggregate'
        ? retained.executedIndex
        : retained.serviceIndex;
    if (index === undefined || !Number.isSafeInteger(index) || index < 1) {
      return yield* makeZerospinError('machine-source-index-invalid');
    }
    const state = tx
      .select()
      .from(props.schema.machineState)
      .where(eq(props.schema.machineState.id, 1))
      .get();
    if (state === undefined) {
      return yield* makeZerospinError('machine-state-missing');
    }
    if (index <= state.sourceIndex) return;
    if (index !== state.sourceIndex + 1) {
      return yield* makeZerospinError('machine-source-gap');
    }
    if (execution.status === 'succeeded') {
      yield* applyExecutionDeltaTx({
        tx,
        models: machine.source.models,
        executionDelta: execution.executionDelta,
      });
    }
    // Source rows remain available for selection queries; callbacks read only
    // the materialized selection in separately named tables.
    const selected = getGraph({
      db: tx,
      models: machine.source.models,
      selections: machine.selections,
      identity: {},
    });
    tx.run(sql.raw('PRAGMA defer_foreign_keys = ON'));
    for (const table of Object.values(props.selectedSchema)) {
      tx.delete(table).run();
    }
    for (const resource of Object.values(selected)) {
      const model = machine.source.models[resource.modelName];
      const table: SQLiteTable | undefined =
        props.selectedSchema[resource.modelName];
      if (model === undefined || table === undefined) {
        return yield* makeZerospinError('machine-selected-model-unavailable');
      }
      const decoded = yield* Schema.decodeUnknownEffect(
        makeEffectSchema(model.propertiesShape),
      )(resource, { onExcessProperty: 'error' });
      const encoded = yield* Schema.encodeEffect(
        makeEffectSchema(model.propertiesShape),
      )(decoded);
      const values = {
        ...encoded,
        id: resource.id,
        modelName: resource.modelName,
        version: resource.version,
        createdAt: resource.createdAt,
        updatedAt: resource.updatedAt,
      };
      const entries = Object.entries(values);
      tx.run(sql`INSERT INTO ${sql.identifier(getTableName(table))}
        (${sql.join(
          entries.map(([key]) => sql.identifier(key)),
          sql.raw(', '),
        )})
        VALUES (${sql.join(
          entries.map(
            ([, value]) =>
              sql`${value instanceof Date ? value.getTime() : value}`,
          ),
          sql.raw(', '),
        )})`);
    }
    if (props.react && state.revision >= 0) {
      const current = machine.states[state.stateName];
      if (current === undefined) {
        return yield* makeZerospinError('machine-state-unavailable');
      }
      const decodedOrigin = yield* Schema.decodeUnknownEffect(
        Schema.toCodecJson(current.schema),
      )(JSON.parse(state.stateJson)).pipe(Effect.scoped);
      const origin = decodedOrigin as IStateValue;
      const route = machine.routes[state.stateName] as
        | IRuntimeRoute
        | undefined;
      const destination = route?.onCommand?.({
        origin,
        db: props.selectedDb,
        command: occurrence,
      });
      if (destination !== undefined) {
        yield* enterMachineStateTx({
          tx,
          schema: props.schema,
          machine,
          repoName: props.repoName,
          previous: state,
          origin,
          destination,
          path: `${state.stateName}.onCommand`,
        });
      }
    }
    tx.update(props.schema.machineState)
      .set({ sourceIndex: index })
      .where(eq(props.schema.machineState.id, 1))
      .run();
  },
);
