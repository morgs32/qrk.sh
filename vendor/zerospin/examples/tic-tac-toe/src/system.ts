import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';

import { computerTurn, deterministicComputerMove } from './computerTurn';
import { aggregate } from './gameAggregateV1';

export const system = makeSystem({
  name: 'tic-tac-toe',
  layer: deterministicComputerMove,
  aggregates: {
    game: {
      '1.0.0': aggregate,
    },
  },
  services: {},
  machines: { computerTurn },
});
