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
 * @bad A makeMachineSession wrapper called through React useState instead of exporting machineSession.
 * @bad Disposing a hook-owned session from import.meta.hot.dispose in a session or entry module.
 */
// machineSession.ts
import { makeSession } from '@zerospin/browser';

import { claimsSchema } from '../claimsSchema';
import { receiveResult } from '../contracts/receiveResultV1';
import { recordAcceptance } from '../contracts/recordAcceptanceV1';
import { startRequest } from '../contracts/startRequestV1';
import { machine } from '../machineV1';

import { applicationLayer } from './applicationLayer';

export const machineSession = makeSession({
  kind: 'aggregate',
  sessionName: 'machineSession',
  systemName: 'example',
  aggregateName: 'machine',
  aggregateVersion: '1.0.0',
  actorName: 'human',
  actorVersion: '1.0.0',
  models: { machine },
  contracts: { startRequest, recordAcceptance, receiveResult },
  claimsSchema,
  layer: applicationLayer,
});
