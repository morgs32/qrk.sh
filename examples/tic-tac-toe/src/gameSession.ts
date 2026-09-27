import { makeSession } from '@zerospin/browser';

import { applicationLayer } from './applicationLayer';
import { createGame } from './contracts/createGameV1';
import { playX } from './contracts/playXV1';
import { claimsSchema, game } from './gameV1';

export const gameSession = makeSession({
  sharedWorker: ({ name }) =>
    new SharedWorker(new URL('./zerospin.worker.ts', import.meta.url), {
      type: 'module',
      name,
    }),
  kind: 'aggregate',
  sessionName: 'gameSession',
  aggregateName: 'game',
  aggregateVersion: '1.0.0',
  actorName: 'human',
  actorVersion: '1.0.0',
  models: { game },
  contracts: { createGame, playX },
  automations: {},
  claimsSchema,
  layer: applicationLayer,
  systemName: 'tic-tac-toe',
});
