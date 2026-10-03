import { defineService } from '@zerospin/core/service/defineService';
import { makeServiceVersion } from '@zerospin/core/service/make/makeServiceVersion';
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
  services: {
    computerTurn: {
      '1.0.0': makeServiceVersion(defineService({ name: 'computerTurn' }), {
        version: '1.0.0',
        models: {},
        contracts: {},
      }),
    },
  },
});
