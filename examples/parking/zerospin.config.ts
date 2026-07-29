import { makeSystemConfig } from '@zerospin/sdk';

export default makeSystemConfig({
  entry: 'src/zerospin/system.ts',
  seeds: {
    dev: 'src/zerospin/seeds.ts',
    production: null,
  },
});
