import { Effect } from 'effect';

import type { ISystem } from '../system/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

export const getActorController = Effect.fn('getActorController')(
  function* (props: {
    system: Pick<ISystem, 'accountControllers'>;
    accountName: string;
    actorName: string;
  }) {
    const { system, accountName, actorName } = props;

    const accountController = yield* getByKeyOrThrow({
      record: system.accountControllers,
      key: accountName,
      recordKind: 'accountControllers',
    });

    const actorController = yield* getByKeyOrThrow({
      record: accountController.actorControllers,
      key: actorName,
      recordKind: 'actorControllers',
    });

    return actorController;
  },
);
