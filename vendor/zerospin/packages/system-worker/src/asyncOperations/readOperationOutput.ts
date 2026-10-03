import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';

import { aggregateChainDbConfig } from '../AggregateChain/aggregateChainDbConfig.js';
import { aggregateVersionChainDbConfig } from '../AggregateVersionChain/aggregateVersionChainDbConfig.js';
import { aggregateVersionRepoDbConfig } from '../AggregateVersionRepo/aggregateVersionRepoDbConfig.js';
import { serviceVersionChainDbConfig } from '../ServiceVersionChain/serviceVersionChainDbConfig.js';
import { serviceVersionRepoDbConfig } from '../ServiceVersionRepo/serviceVersionRepoDbConfig.js';
export function orderOperationOutput<T extends { operationIndex: number }>(
  operations: readonly T[],
): T[] {
  const ordered = [...operations].sort(
    (a, b) => a.operationIndex - b.operationIndex,
  );
  const seen = new Set<number>();
  for (const operation of ordered) {
    if (
      !Number.isSafeInteger(operation.operationIndex) ||
      operation.operationIndex < 0 ||
      seen.has(operation.operationIndex)
    ) {
      throw makeZerospinError('duplicate-operation-index');
    }
    seen.add(operation.operationIndex);
  }
  return ordered;
}
export function readAggregateVersionRepoOutput(db: IDb, commandId: string) {
  const { modelOperations, asyncOperations } =
    aggregateVersionRepoDbConfig.schema;
  const models = db
    .select()
    .from(modelOperations)
    .where(eq(modelOperations.commandId, commandId))
    .all();
  const async = db
    .select({
      commandId: asyncOperations.commandId,
      operationIndex: asyncOperations.operationIndex,
      asyncContractName: asyncOperations.asyncContractName,
      asyncContractVersion: asyncOperations.asyncContractVersion,
      payload: asyncOperations.payload,
      committedAt: asyncOperations.committedAt,
      executedIndex: asyncOperations.executedIndex,
    })
    .from(asyncOperations)
    .where(eq(asyncOperations.commandId, commandId))
    .all()
    .map(row => ({ ...row, operationName: 'async' as const }));
  return orderOperationOutput<(typeof models)[number] | (typeof async)[number]>(
    [...models, ...async],
  );
}
export function readAggregateVersionChainOutput(db: IDb, commandId: string) {
  const { modelOperations, asyncOperations } =
    aggregateVersionChainDbConfig.schema;
  const models = db
    .select()
    .from(modelOperations)
    .where(eq(modelOperations.commandId, commandId))
    .all();
  const async = db
    .select({
      commandId: asyncOperations.commandId,
      operationIndex: asyncOperations.operationIndex,
      asyncContractName: asyncOperations.asyncContractName,
      asyncContractVersion: asyncOperations.asyncContractVersion,
      payload: asyncOperations.payload,
      committedAt: asyncOperations.committedAt,
      executedIndex: asyncOperations.executedIndex,
    })
    .from(asyncOperations)
    .where(eq(asyncOperations.commandId, commandId))
    .all()
    .map(row => ({ ...row, operationName: 'async' as const }));
  return orderOperationOutput<(typeof models)[number] | (typeof async)[number]>(
    [...models, ...async],
  );
}
export function readAggregateChainOutput(db: IDb, commandId: string) {
  const { modelOperations, asyncOperations } = aggregateChainDbConfig.schema;
  const models = db
    .select()
    .from(modelOperations)
    .where(eq(modelOperations.commandId, commandId))
    .all();
  const async = db
    .select({
      commandId: asyncOperations.commandId,
      operationIndex: asyncOperations.operationIndex,
      asyncContractName: asyncOperations.asyncContractName,
      asyncContractVersion: asyncOperations.asyncContractVersion,
      payload: asyncOperations.payload,
      committedAt: asyncOperations.committedAt,
      aggregateIndex: asyncOperations.aggregateIndex,
    })
    .from(asyncOperations)
    .where(eq(asyncOperations.commandId, commandId))
    .all()
    .map(row => ({ ...row, operationName: 'async' as const }));
  return orderOperationOutput<(typeof models)[number] | (typeof async)[number]>(
    [...models, ...async],
  );
}
export function readServiceVersionRepoOutput(db: IDb, commandId: string) {
  const { modelOperations, asyncOperations } =
    serviceVersionRepoDbConfig.schema;
  const models = db
    .select()
    .from(modelOperations)
    .where(eq(modelOperations.commandId, commandId))
    .all();
  const async = db
    .select({
      commandId: asyncOperations.commandId,
      operationIndex: asyncOperations.operationIndex,
      asyncContractName: asyncOperations.asyncContractName,
      asyncContractVersion: asyncOperations.asyncContractVersion,
      payload: asyncOperations.payload,
      committedAt: asyncOperations.committedAt,
      serviceIndex: asyncOperations.serviceIndex,
    })
    .from(asyncOperations)
    .where(eq(asyncOperations.commandId, commandId))
    .all()
    .map(row => ({ ...row, operationName: 'async' as const }));
  return orderOperationOutput<(typeof models)[number] | (typeof async)[number]>(
    [...models, ...async],
  );
}
export function readServiceVersionChainOutput(db: IDb, commandId: string) {
  const { modelOperations, asyncOperations } =
    serviceVersionChainDbConfig.schema;
  const models = db
    .select()
    .from(modelOperations)
    .where(eq(modelOperations.commandId, commandId))
    .all();
  const async = db
    .select({
      commandId: asyncOperations.commandId,
      operationIndex: asyncOperations.operationIndex,
      asyncContractName: asyncOperations.asyncContractName,
      asyncContractVersion: asyncOperations.asyncContractVersion,
      payload: asyncOperations.payload,
      committedAt: asyncOperations.committedAt,
      serviceIndex: asyncOperations.serviceIndex,
    })
    .from(asyncOperations)
    .where(eq(asyncOperations.commandId, commandId))
    .all()
    .map(row => ({ ...row, operationName: 'async' as const }));
  return orderOperationOutput<(typeof models)[number] | (typeof async)[number]>(
    [...models, ...async],
  );
}
