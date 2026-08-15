/* AggregateBlockRepo incompatible persisted-command rejection. */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { managedRuntime } from '../managedRuntime.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';

import { AggregateBlockRepo } from './AggregateBlockRepo.js';
import { getAggregateBlockRepo } from './getAggregateBlockRepo/getAggregateBlockRepo.js';

describe('AggregateBlockRepo persisted schema', () => {
  it.effect('rejects legacy command version columns before mutating them', () =>
    Effect.gen(function* () {
      const key = {
        generationId: 'gen_aggregate_block_legacy_command_version',
        aggregateId: 'acct_aggregate_block_legacy_command_version',
        aggregateName: 'user',
      };
      const failure = yield* Effect.promise(() =>
        executeInRepo({
          managedRuntime,
          getRepo: getAggregateBlockRepo,
          repo: AggregateBlockRepo,
          key,
          fn: async ({ key: repoKey, name, state }) => {
            state.storage.sql.exec(
              'ALTER TABLE executedCommands RENAME COLUMN contractVersion TO version',
            );
            try {
              await managedRuntime.runPromise(
                AggregateBlockRepo.boundDORepoConfig
                  .getDbConfig({
                    key: repoKey,
                    name,
                    storage: state.storage,
                  })
                  .pipe(Effect.provide(AsyncLive)),
              );
              return '';
            } catch (cause) {
              return cause instanceof Error ? cause.message : String(cause);
            }
          },
        }),
      );

      expect(failure).toContain(
        'legacy-aggregate-block-command-persistence-reset-required',
      );
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('rejects legacy block provenance before mutating it', () =>
    Effect.gen(function* () {
      const key = {
        generationId: 'gen_aggregate_block_legacy_provenance',
        aggregateId: 'acct_aggregate_block_legacy_provenance',
        aggregateName: 'user',
      };
      const inspected = yield* Effect.promise(() =>
        executeInRepo({
          managedRuntime,
          getRepo: getAggregateBlockRepo,
          repo: AggregateBlockRepo,
          key,
          fn: async ({ key: repoKey, name, state }) => {
            state.storage.sql.exec(
              'ALTER TABLE finalizedBlocks RENAME COLUMN writeIndex TO pushedBlockId',
            );
            const before = [
              ...state.storage.sql.exec<{ name: string }>(
                'PRAGMA table_info(finalizedBlocks)',
              ),
            ].map(column => column.name);
            let failure = '';
            try {
              await managedRuntime.runPromise(
                AggregateBlockRepo.boundDORepoConfig
                  .getDbConfig({
                    key: repoKey,
                    name,
                    storage: state.storage,
                  })
                  .pipe(Effect.provide(AsyncLive)),
              );
            } catch (cause) {
              failure = cause instanceof Error ? cause.message : String(cause);
            }
            return {
              before,
              after: [
                ...state.storage.sql.exec<{ name: string }>(
                  'PRAGMA table_info(finalizedBlocks)',
                ),
              ].map(column => column.name),
              failure,
            };
          },
        }),
      );

      expect(inspected.failure).toContain(
        'legacy-aggregate-block-command-persistence-reset-required',
      );
      expect(inspected.after).toEqual(inspected.before);
      expect(inspected.after).toContain('pushedBlockId');
      expect(inspected.after).not.toContain('writeIndex');
    }).pipe(Effect.provide(AsyncLive)),
  );
});
