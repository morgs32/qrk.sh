import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { ZerospinError } from '@zerospin/error';
import { Effect, ManagedRuntime } from 'effect';
import { system } from 'system';
import { expect, it, vi } from 'vitest';

import * as durableDb from '../makeDurableDb.js';

import { makeDORepo } from './makeDORepo.js';
import { makeRepoNameUtils } from './makeRepoNameUtils.js';

it.each(['unlocked', 'mismatch', 'transport', 'bootstrap retry', 'cold alarm'])(
  'guards storage, bootstrap and activation: %s',
  async scenario => {
    const dbConfig = makeDbConfig({ tables: {} });
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    const binding = vi.spyOn(durableDb, 'makeDurableDb').mockReturnValue(db);
    const runtime = ManagedRuntime.make(AsyncLive);
    const events: string[] = [];
    const markers = new Map<string, string>();
    let accepted = false;
    let failBootstrap = scenario === 'bootstrap retry';
    const registerRepo = vi.fn(async () => {
      events.push('register');
      if (scenario === 'transport' && !accepted) throw new Error('unavailable');
      if (!accepted) {
        return encodeFailure(
          new ZerospinError({ code: `system-spec-${scenario}` }),
        );
      }
      return encodeSuccess(undefined);
    });
    const context = {
      id: { name: 'sys_test' },
      blockConcurrencyWhile: (run: () => Promise<void>) => run(),
      storage: {
        sql: {
          exec: vi.fn(() => {
            events.push('sql');
          }),
        },
        kv: {
          get: vi.fn((key: string) => {
            events.push('read');
            return markers.get(key);
          }),
          put: vi.fn((key: string, value: string) => {
            events.push('mark');
            markers.set(key, value);
          }),
        },
      },
    };
    const environment = {
      ZEROSPIN_SYSTEM_ID: 'sys_test',
      SYSTEM_REPO: { getByName: () => ({ registerRepo }) },
    };
    const Repo = class extends makeDORepo({
      namespaceBinding: 'SYSTEM_LOG_REPO',
      baseClass: null,
      repoType: 'SystemLogRepo',
      managedRuntime: runtime,
      nameUtils: makeRepoNameUtils({
        abbreviation: undefined,
        namePattern: RoutePattern.parse('/:systemId'),
      }),
      dbConfig: () => Effect.succeed(dbConfig),
      initializeSchema: ({ isBootstrapped }) =>
        Effect.sync(() => {
          if (!isBootstrapped) events.push('provision');
        }),
      bootstrap: () =>
        Effect.gen(function* () {
          events.push('bootstrap');
          if (failBootstrap) {
            failBootstrap = false;
            return yield* new ZerospinError({ code: 'bootstrap-failed' });
          }
        }),
    }) {
      override onDOActivation() {
        return Effect.sync(() => {
          events.push('subscribe');
        });
      }
    };
    try {
      // @ts-expect-error Only storage and concurrency operations used by this lifecycle are implemented by the test state.
      const rejected = new Repo(context, environment);
      await expect(rejected.doRepoInitialization).rejects.toThrow(
        scenario === 'transport' ? 'unavailable' : `system-spec-${scenario}`,
      );
      expect(events).toEqual(['register']);
      expect(markers.size).toBe(0);
      expect(registerRepo).toHaveBeenCalledWith({
        spec: makeSystemSpec({ system }),
        registration: {
          repoType: 'SystemLogRepo',
          repoName: 'sys_test',
          tableNames: [],
        },
      });
      accepted = true;
      events.length = 0;
      // @ts-expect-error Deliberately partial lifecycle state as above.
      let repo = new Repo(context, environment);
      if (scenario === 'bootstrap retry') {
        await expect(repo.doRepoInitialization).rejects.toThrow(
          'bootstrap-failed',
        );
        expect(events).toEqual([
          'register',
          'sql',
          'read',
          'provision',
          'bootstrap',
        ]);
        expect(markers.size).toBe(0);
        events.length = 0;
        // @ts-expect-error Reconstruct the same object with its retained storage.
        repo = new Repo(context, environment);
      }
      await repo.doRepoInitialization;
      expect(events).toEqual([
        'register',
        'sql',
        'read',
        'provision',
        'bootstrap',
        'mark',
        'subscribe',
      ]);
      if (scenario === 'cold alarm') {
        events.length = 0;
        accepted = false;
        // @ts-expect-error Reconstruct the marked object for a cold alarm event.
        const cold = new Repo(context, environment);
        const alarm = vi.spyOn(cold, 'alarm');
        await expect(
          cold.doRepoInitialization.then(() => cold.alarm()),
        ).rejects.toThrow('system-spec-cold alarm');
        expect(alarm).not.toHaveBeenCalled();
        expect(events).toEqual(['register']);
        accepted = true;
        events.length = 0;
        // @ts-expect-error Reconstruct after acceptance; marker skips only provisioning/bootstrap.
        const resumed = new Repo(context, environment);
        await resumed.doRepoInitialization;
        resumed.alarmRegistry.register(
          'pending',
          Effect.sync(() => {
            events.push('alarm');
          }),
        );
        await resumed.alarm();
        expect(events).toEqual([
          'register',
          'sql',
          'read',
          'subscribe',
          'alarm',
        ]);
      }
    } finally {
      binding.mockRestore();
      await runtime.dispose();
    }
  },
);
