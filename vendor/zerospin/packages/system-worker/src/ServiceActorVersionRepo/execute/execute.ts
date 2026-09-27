import type { IDb } from '@zerospin/core/drizzle/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import config from 'config';
import { Effect } from 'effect';

import type { serviceVersionChainDbConfig } from '../../ServiceVersionChain/serviceVersionChainDbConfig.js';

import { executeTx } from './executeTx.js';

const { system } = config;

/** Replay one immutable result at a time; projection failure rolls back the whole delivery page. */
export const execute = Effect.fn('ServiceActorVersionRepo.execute')(
  function* (props: {
    rows: readonly (typeof serviceVersionChainDbConfig.schema.commands.$inferSelect)[];
    db: IDb;
    key: {
      systemId: string;
      serviceName: string;
      serviceVersion: string;
      actorPath: string;
      actorName: string;
      actorVersion: string;
    };
  }) {
    const { db, key, rows } = props;
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
    yield* executeTx(db, { rows, service, key });
  },
);
