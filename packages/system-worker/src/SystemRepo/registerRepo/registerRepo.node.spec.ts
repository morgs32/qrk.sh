import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { Effect } from 'effect';
import { system } from 'system';
import { describe, expect, it } from 'vitest';

import { checkSystemSpec } from '../checkSystemSpec/checkSystemSpec.js';
import { getRepoRegistrations } from '../getRepoRegistrations/getRepoRegistrations.js';
import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

import { registerRepo } from './registerRepo.js';

describe('SystemRepo.registerRepo', () => {
  it('registers VersionedAggregateChain repos for inspection', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({ dbConfig: systemRepoDbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    const spec = makeSystemSpec({ system });
    await Effect.runPromise(checkSystemSpec({ db, spec }));
    await Effect.runPromise(
      registerRepo({
        spec,
        db,
        repoTable: systemRepoDbConfig.schema.repos,
        registration: {
          repoType: 'VersionedAggregateChain',
          repoName: 'aggpush_sys_1/acct_1/shopping/user_1/web',
          tableNames: ['commands'],
        },
      }),
    );
    await expect(
      Effect.runPromise(
        getRepoRegistrations({
          db,
          systemId: 'sys_test',
          repoTable: systemRepoDbConfig.schema.repos,
          repoType: 'VersionedAggregateChain',
        }),
      ),
    ).resolves.toEqual([
      {
        repoType: 'VersionedAggregateChain',
        repoName: 'aggpush_sys_1/acct_1/shopping/user_1/web',
        tableNames: ['commands'],
      },
    ]);
  });
});
