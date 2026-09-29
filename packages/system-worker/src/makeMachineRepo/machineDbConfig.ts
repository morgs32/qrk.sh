import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeDrizzleRelationsFromTables } from '@zerospin/core/drizzle/make/makeDbConfig/makeDrizzleRelationsFromTables/makeDrizzleRelationsFromTables';
import { makeDrizzleSchemasRecordFromTables } from '@zerospin/core/drizzle/make/makeDrizzleSchemasRecordFromTables';
import type { IAnyMachineDeclaration } from '@zerospin/core/machine/types';
import { Model } from '@zerospin/core/models/defineModel';
import { makeTable, primitives } from '@zerospin/schema';
import { mapValues } from 'es-toolkit';

/** Resource tables are added from the selected source version at Repo creation. */
export const machineTables = {
  machineState: makeTable({
    name: 'machineState',
    shape: {
      id: primitives.integer({ primaryKey: true }),
      revision: primitives.integer(),
      stateName: primitives.text(),
      stateJson: primitives.text(),
      sourceVersion: primitives.text(),
      sourceIndex: primitives.integer(),
      projectionTables: primitives.text(),
      phase: primitives.enum({ values: ['bootstrap', 'rebuilding', 'ready'] }),
      rebuildDestination: primitives.integer({ nullable: true }),
      previousVersion: primitives.text({ nullable: true }),
      wakeAt: primitives.integer({ nullable: true }),
    },
  }),
  machineOperations: makeTable({
    name: 'machineOperations',
    shape: {
      id: primitives.primaryKey({ abbreviation: 'mop' }),
      revision: primitives.integer(),
      kind: primitives.enum({ values: ['activation', 'command'] }),
      status: primitives.enum({
        values: ['pending', 'running', 'succeeded', 'failed', 'cancelled'],
      }),
      failure: primitives.text({ nullable: true }),
      commandJson: primitives.text({ nullable: true }),
      resultJson: primitives.text({ nullable: true }),
      retryAt: primitives.integer({ nullable: true }),
    },
  }),
};

export const makeMachineDbConfig = (machine: IAnyMachineDeclaration) =>
  makeResourceDbConfig({
    models: machine.source.models,
    otherTables: machineTables,
  });

export const makeMachineSelectedDbConfig = (
  machine: IAnyMachineDeclaration,
) => {
  const tables = mapValues(machine.source.models, model => model.table);
  const physicalTableNames = mapValues(
    tables,
    (_table, key) => `machine_selected_${key}`,
  );
  const tableAliases = new Map();
  for (const model of Object.values(machine.source.models)) {
    if (Model.isReplica(model)) {
      tableAliases.set(model.sourceModel.table, model.table);
    }
  }
  return {
    tables,
    schema: makeDrizzleSchemasRecordFromTables(
      tables,
      physicalTableNames,
      tableAliases,
    ),
    relations: makeDrizzleRelationsFromTables(
      tables,
      physicalTableNames,
      tableAliases,
    ),
  };
};
