import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { getRepoRegistrations } from '../getRepoRegistrations/getRepoRegistrations.js';
import { systemRepoDbConfig } from '../SystemRepoDbConfig.js';

import { registerRepo } from './registerRepo.js';

describe('SystemRepo.registerRepo', () => {
  it('registers AggregateFrontendPushedCommandChain repos for inspection', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({ dbConfig: systemRepoDbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    await Effect.runPromise(
      registerRepo({
        db,
        repoTable: systemRepoDbConfig.schema.repos,
        registration: {
          repoType: 'AggregateFrontendPushedCommandChain',
          repoName: 'aggpush_sys_1/acct_1/shopping/user_1/web',
          tableNames: ['commands'],
        },
      }),
    );
    await expect(
      Effect.runPromise(
        getRepoRegistrations({
          db,
          repoTable: systemRepoDbConfig.schema.repos,
          repoType: 'AggregateFrontendPushedCommandChain',
        }),
      ),
    ).resolves.toEqual([
      {
        repoType: 'AggregateFrontendPushedCommandChain',
        repoName: 'aggpush_sys_1/acct_1/shopping/user_1/web',
        tableNames: ['commands'],
      },
    ]);
  });
});
