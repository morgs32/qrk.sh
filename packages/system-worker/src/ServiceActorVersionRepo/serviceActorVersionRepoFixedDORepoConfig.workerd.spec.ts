import { env, runInDurableObject } from 'cloudflare:test';
import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { ServiceActorVersionChain } from '../ServiceActorVersionChain/ServiceActorVersionChain.js';

import { serviceActorVersionRepoFixedDORepoConfig } from './serviceActorVersionRepoFixedDORepoConfig.js';

const key = {
  systemId: env.ZEROSPIN_SYSTEM_ID,
  serviceName: 'app',
  serviceVersion: '1.0.0',
  actorName: '__service',
  actorVersion: '1.0.0',
  actorPath: '/',
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

it.each([
  {
    label: 'private service binding',
    actorName: '__service',
    actorVersion: '1.0.0',
    actorPath: '/',
  },
  {
    label: 'authored actor',
    actorName: 'default',
    actorVersion: '1.0.0',
    actorPath: '/binding-valid',
  },
])(
  'resolves the config for a valid $label',
  async ({ label: _label, ...binding }) => {
    const result = await resolveBinding({ ...key, ...binding });
    expect(result.error).toBeNull();
    expect(result.tables).toEqual(
      expect.arrayContaining(['commands', 'product', 'catalogSettings']),
    );
  },
);

it.each([
  {
    label: 'mismatched internal version',
    actorName: '__service',
    actorVersion: '1.1.0',
    actorPath: '/',
    error: 'actor-version-invalid',
  },
  {
    label: 'non-root internal path',
    actorName: '__service',
    actorVersion: '1.0.0',
    actorPath: '/invalid',
    error: 'actor-version-invalid',
  },
  {
    label: 'invalid authored path',
    actorName: 'default',
    actorVersion: '1.0.0',
    actorPath: '/too/many/segments',
    error: 'actor-path-invalid',
  },
])('rejects a $label', async ({ label: _label, error, ...binding }) => {
  expect(await resolveBinding({ ...key, ...binding })).toEqual({
    tables: [],
    error,
  });
});

it('rejects the private service binding in the browser chain config', async () => {
  const name = await Effect.runPromise(
    serviceActorVersionRepoFixedDORepoConfig.nameUtils.makeName(key),
  );
  const repo = env.SERVICE_ACTOR_VERSION_REPO.getByName(name);
  const error = await runInDurableObject(repo, async (_instance, state) =>
    ServiceActorVersionChain.fixedDORepoConfig.managedRuntime.runPromise(
      ServiceActorVersionChain.fixedDORepoConfig
        .dbConfig({ key, name, storage: state.storage })
        .pipe(
          Effect.flip,
          Effect.map(error => error.code),
        ),
    ),
  );
  expect(error).toBe('actor-version-invalid');
});
