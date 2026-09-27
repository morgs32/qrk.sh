import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import type { ISystemSpec } from '@zerospin/core/system/types';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import type { AnyColumn } from 'drizzle-orm';

import { registerRepo } from '../registerRepo/registerRepo.js';
import { type systemRepoDbConfig } from '../systemRepoDbConfig.js';

/** Commit the definition projection and actor-command chain registrations together. */
export const registerReposTx = makeTx('SystemRepo.registerReposTx')(function* (
  tx: ITx<typeof systemRepoDbConfig>,
  props: {
    spec: ISystemSpec;
    repoTable: IAnyDrizzleSchema & {
      repoType: AnyColumn;
      repoName: AnyColumn;
      tableNames: AnyColumn;
    };
    sessionRepo: {
      repoType: 'AggregateActorVersionRepo' | 'ServiceActorVersionRepo';
      repoName: string;
      tableNames: readonly string[];
    };
    finalizedCommandChain: {
      repoType: 'AggregateActorVersionChain' | 'ServiceActorVersionChain';
      repoName: string;
      tableNames: readonly string[];
    };
  },
) {
  const { repoTable, sessionRepo, finalizedCommandChain, spec } = props;

  // 3 — retain its Repo type, physical name, and local table names
  yield* registerRepo({
    spec,
    db: tx,
    repoTable,
    registration: {
      repoType: sessionRepo.repoType,
      repoName: sessionRepo.repoName,
      tableNames: sessionRepo.tableNames,
    },
  });

  // 4 — commit its table metadata beside the definition materializer registration
  yield* registerRepo({
    spec,
    db: tx,
    repoTable,
    registration: {
      repoType: finalizedCommandChain.repoType,
      repoName: finalizedCommandChain.repoName,
      tableNames: finalizedCommandChain.tableNames,
    },
  });
});
