import type { Effect } from 'effect';

/**
 * Each Repo inherits getRepo from makeDORepo and supplies namespaceBinding at its factory call.
 * Lookup formats the caller-supplied key and resolves a stub lazily when its Effect runs.
 * Pass Repo.getRepo directly to fanout; its captured configuration needs no this binding.
 * SystemRepo uses only the configured systemId; its constructor enforces that singleton identity.
 *
 * @bad Add a standalone get*Repo lookup helper or a per-Repo static implementation.
 * @bad Put namespace lookup in fixedDORepoConfig or versionedDORepoConfig.
 * @bad Read a namespace while defining the class, or run readiness or authorization during lookup.
 */
export const lookup = VersionedServiceRepo.getRepo({
  key: { systemId: 'sys_1', serviceName: 'catalog', serviceVersion: '1.0.0' },
});

// The same captured function can be supplied as a queue's getRepo callback.
export const queueLookup = VersionedServiceRepo.getRepo;

declare const VersionedServiceRepo: {
  getRepo(props: {
    key: { systemId: string; serviceName: string; serviceVersion: string };
  }): Effect.Effect<unknown>;
};
