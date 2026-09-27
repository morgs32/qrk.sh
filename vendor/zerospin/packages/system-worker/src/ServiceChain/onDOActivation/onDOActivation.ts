import type { IDb } from '@zerospin/core/drizzle/types';
import { catchZerospinError } from '@zerospin/error';
import config from 'config';
import { Effect } from 'effect';

import type { IAlarmRegistry } from '../../makeAlarmRegistry/makeAlarmRegistry.js';
import { ServiceVersionRepo } from '../../ServiceVersionRepo/ServiceVersionRepo.js';
import { serviceChainDbConfig } from '../serviceChainDbConfig.js';

const { system } = config;

/** Reconcile deployed membership, preserving retained cursors and failure state. */
export const onDOActivation = Effect.fn('ServiceChain.onDOActivation')(
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
          const serviceVersionRepoName =
            yield* ServiceVersionRepo.fixedDORepoConfig.nameUtils.makeName({
              ...props.key,
              serviceVersion,
            });
          return { serviceVersionRepoName, serviceVersion };
        }),
    );
    yield* props.alarms.hold('admissionResultsFanout');
    yield* Effect.try({
      try: () =>
        props.db.transaction(tx => {
          tx.update(serviceChainDbConfig.schema.serviceSubscribers)
            .set({ active: false })
            .run();
          for (const destination of destinations) {
            tx.insert(serviceChainDbConfig.schema.serviceSubscribers)
              .values({
                ...destination,
                active: true,
                currentIndex: null,
                failure: null,
              })
              .onConflictDoUpdate({
                target:
                  serviceChainDbConfig.schema.serviceSubscribers
                    .serviceVersionRepoName,
                set: { active: true },
              })
              .run();
          }
        }),
      catch: catchZerospinError({
        code: 'service-membership-reconciliation-failed',
      }),
    });
  },
);
