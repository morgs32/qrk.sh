import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { ISystemSpec } from '@zerospin/core/system/types';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import type { AnyColumn } from 'drizzle-orm';

import { registerRepo } from '../registerRepo/registerRepo.js';
import { SystemRepoDb } from '../systemRepoDbConfig.js';

/** Commit the frontend projection and finalized command chain registrations together. */
export const registerReposTx = makeTx(
  'SystemRepo.registerReposTx',
  SystemRepoDb,
)(function* (props: {
  spec: ISystemSpec;
  repoTable: IAnyDrizzleSchema & {
    repoType: AnyColumn;
    repoName: AnyColumn;
    tableNames: AnyColumn;
  };
  frontendRepo: {
    repoType: 'UserVersionedAggregateRepo' | 'FrontendVersionedServiceRepo';
    repoName: string;
    tableNames: readonly string[];
  };
  finalizedCommandChain: {
    repoType: 'UserVersionedAggregateChain' | 'FrontendServiceChain';
    repoName: string;
    tableNames: readonly string[];
  };
}) {
  const { repoTable, frontendRepo, finalizedCommandChain } = props;

  const tx = yield* SystemRepoDb.Tx;

  // 3 — retain its Repo type, physical name, and local table names
  yield* registerRepo({
    spec: props.spec,
    db: tx,
    repoTable,
    registration: {
      repoType: frontendRepo.repoType,
      repoName: frontendRepo.repoName,
      tableNames: frontendRepo.tableNames,
    },
  });

  // 4 — commit its table metadata beside the frontend materializer registration
  yield* registerRepo({
    spec: props.spec,
    db: tx,
    repoTable,
    registration: {
      repoType: finalizedCommandChain.repoType,
      repoName: finalizedCommandChain.repoName,
      tableNames: finalizedCommandChain.tableNames,
    },
  });
});
