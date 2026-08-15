import { makeSystemConfig } from '@zerospin/sdk';

export default makeSystemConfig({
  entry: 'src/zerospin/system.ts',
  supportedPredecessors: [],
  seeds: {
    dev: 'src/zerospin/seeds.ts',
    production: null,
  },
});
