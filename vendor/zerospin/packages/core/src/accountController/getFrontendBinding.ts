import { Effect } from 'effect';

import type { ISystem } from '../system/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { getActorController } from './getActorController.ts';

export const getFrontendBinding = Effect.fn('getFrontendBinding')(
  function* (props: {
    system: Pick<ISystem, 'accountControllers'>;
    accountName: string;
    actorName: string;
    frontendName: string;
  }) {
    const { system, accountName, actorName, frontendName } = props;

    const actorController = yield* getActorController({
      system,
      accountName,
      actorName,
    });

    const frontendBinding = yield* getByKeyOrThrow({
      record: actorController.frontends,
      key: frontendName,
      recordKind: 'frontends',
    });

    return frontendBinding;
  },
);
