import { makeSeeds } from '@zerospin/core/system/makeSeeds';

import { transitionAppServiceV1, transitionSystemV1 } from './version1';

export const seeds = makeSeeds({
  system: transitionSystemV1,
  accounts: {},
  services: {
    app: [
      transitionAppServiceV1.makeCommand({
        contractName: 'createTransitionProduct',
        systemVersion: transitionSystemV1.version,
        payload: {
          name: 'Transition fixture product',
        },
      }),
    ],
  },
});
