import type { IMachine } from '../types.js';

import { decodeMachineData } from './decodeMachineData.js';
import { Machine } from './Machine.js';
import { Route } from './Route.js';

export const makeMachineValue = (input: unknown): IMachine => {
  const data = decodeMachineData(input, false);
  const routes: Record<string, Route> = {};
  for (const key of Reflect.ownKeys(data.routes)) {
    if (typeof key !== 'string') {
      continue;
    }
    const route = data.routes[key];
    if (route !== undefined) {
      routes[key] = new Route(route);
    }
  }

  // ALLOWED_CAST: decodeMachineData strictly validates the complete authored
  // definition before the private canonical Machine class retains its decoded
  // State-map and Route snapshots.
  return new Machine({
    states: data.states,
    initial: data.initial,
    routes,
  }) as unknown as IMachine;
};
