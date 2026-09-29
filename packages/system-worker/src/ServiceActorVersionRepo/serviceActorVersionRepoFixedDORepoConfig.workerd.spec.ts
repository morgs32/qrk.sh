import { env, runInDurableObject } from 'cloudflare:test';
import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { serviceActorVersionRepoFixedDORepoConfig } from './serviceActorVersionRepoFixedDORepoConfig.js';

const key = {
  systemId: env.ZEROSPIN_SYSTEM_ID,
  serviceName: 'app',
  serviceVersion: '1.0.0',
  actorName: 'default',
  actorVersion: '1.0.0',
  actorPath: '/binding-valid',
};

const resolveBinding = async (binding: typeof key) => {
  const name = await Effect.runPromise(
    serviceActorVersionRepoFixedDORepoConfig.nameUtils.makeName(key),
  );
  const repo = env.SERVICE_ACTOR_VERSION_REPO.getByName(name);
  return runInDurableObject(repo, async (_instance, state) =>
    serviceActorVersionRepoFixedDORepoConfig.managedRuntime.runPromise(
      serviceActorVersionRepoFixedDORepoConfig
        .dbConfig({ key: binding, name, storage: state.storage })
        .pipe(
          Effect.match({
            onSuccess: config => ({
              tables: Object.keys(config.tables),
              error: null,
            }),
            onFailure: error => ({ tables: [], error: error.code }),
          }),
        ),
    ),
  );
};

it('resolves the resource schema for an authored service actor', async () => {
  const result = await resolveBinding(key);
  expect(result.error).toBeNull();
  expect(result.tables).toEqual(
    expect.arrayContaining(['commands', 'product', 'catalogSettings']),
  );
});

it('rejects an invalid authored actor path', async () => {
  expect(await resolveBinding({ ...key, actorPath: '/too/many/segments' })).toEqual({
    tables: [],
    error: 'actor-path-invalid',
  });
});
