import type { IDb } from '@zerospin/core/drizzle/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { Effect } from 'effect';
import { system } from 'system';

import type { versionedServiceChainDbConfig } from '../../VersionedServiceChain/versionedServiceChainDbConfig.js';
import { FrontendVersionedServiceRepoDb } from '../frontendVersionedServiceRepoDbConfig.js';

import { executeTx } from './executeTx.js';

/** Replay one immutable result at a time; projection failure rolls back the whole delivery page. */
export const execute = Effect.fn('FrontendVersionedServiceRepo.execute')(
  function* (props: {
    rows: readonly (typeof versionedServiceChainDbConfig.schema.commands.$inferSelect)[];
    db: IDb;
    key: {
      systemId: string;
      serviceName: string;
      serviceVersion: string;
      userId: string;
      frontendName: string;
    };
  }) {
    const { db, key } = props;
    const authored = yield* getByKeyOrThrow({
      record: system.services,
      key: key.serviceName,
      recordKind: 'services',
    });
    const service = yield* getByKeyOrThrow({
      record: authored,
      key: key.serviceVersion,
      recordKind: 'listed versions',
    });
    const frontend = yield* getByKeyOrThrow({
      record: service.frontends,
      key: key.frontendName,
      recordKind: 'service frontends',
    });
    yield* executeTx({ rows: props.rows, service, frontend, key }).pipe(
      Effect.provideService(FrontendVersionedServiceRepoDb, db),
    );
  },
);
