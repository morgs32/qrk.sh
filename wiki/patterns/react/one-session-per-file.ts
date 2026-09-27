/**
 * Export each browser session as a module-level value from its own named file.
 * Import a shared application layer from a separate module. Keep operation IDs and
 * initialization in the caller. Import and pass the session value directly.
 * Let the session own its runtime; read session.runtime again after reinitializing.
 * Let useInitializeSession own initialization and disposal after React commit.
 * On session replacement, cleanup invokes disposal before the next initialization
 * without awaiting disposal. Entry modules own root.unmount() on hot reload.
 *
 * @bad Constructing and disposing a separate application runtime for browser sessions.
 * @bad A sessions.ts makeSessions factory that declares multiple sessions and returns them with operation IDs.
 * @bad A makeGameSession wrapper called through React useState instead of exporting gameSession.
 * @bad Disposing a hook-owned session from import.meta.hot.dispose in a session or entry module.
 */
// gameSession.ts
import { makeSession } from '@zerospin/browser';

import { applicationLayer } from './applicationLayer';
import { createGame } from './contracts/createGameV1';
import { playX } from './contracts/playXV1';
import { claimsSchema, game } from './gameV1';

export const gameSession = makeSession({
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
