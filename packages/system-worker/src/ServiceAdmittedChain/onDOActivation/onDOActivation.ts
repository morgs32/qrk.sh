import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';
import { system } from 'system';

import type { IAlarmRegistry } from '../../makeAlarmRegistry/makeAlarmRegistry.js';
import { VersionedServiceRepo } from '../../VersionedServiceRepo/VersionedServiceRepo.js';
import { serviceAdmittedChainDbConfig } from '../serviceAdmittedChainDbConfig.js';

/** Reconcile deployed membership, preserving retained cursors and failure state. */
export const onDOActivation = Effect.fn('ServiceAdmittedChain.onDOActivation')(
  function* (props: {
    db: IDb;
    key: { systemId: string; serviceName: string };
    alarms: IAlarmRegistry;
  }) {
    const versions = system.services[props.key.serviceName] ?? {};
    const destinations = yield* Effect.forEach(
      Object.keys(versions),
      serviceVersion =>
        Effect.gen(function* () {
          const versionedServiceRepoName =
            yield* VersionedServiceRepo.fixedDORepoConfig.nameUtils.makeName({
              ...props.key,
              serviceVersion,
            });
          return { versionedServiceRepoName, serviceVersion };
        }),
    );
    yield* props.alarms.hold('serviceFanoutQueue');
    yield* Effect.try({
      try: () =>
        props.db.transaction(tx => {
          tx.update(serviceAdmittedChainDbConfig.schema.serviceSubscribers)
            .set({ active: false })
            .run();
          for (const destination of destinations) {
            tx.insert(serviceAdmittedChainDbConfig.schema.serviceSubscribers)
              .values({
                ...destination,
                active: true,
                currentIndex: null,
                failure: null,
              })
              .onConflictDoUpdate({
                target:
                  serviceAdmittedChainDbConfig.schema.serviceSubscribers
                    .versionedServiceRepoName,
                set: { active: true },
              })
              .run();
          }
        }),
      catch: ZerospinError.catch({
        code: 'service-membership-reconciliation-failed',
      }),
    });
  },
);
