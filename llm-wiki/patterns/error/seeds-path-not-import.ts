/**
 * Config seeds are a module path — not imported Effect values at config load time.
 *
 * @bad `import { productSeeds } from './seeds'` and pass resolved commands in makeSystemConfig.
 * @bad `runSync` seeds when the config file loads.
 */
export default makeSystemConfig({
  entry: 'src/zerospin/system.ts',
  supportedPredecessors: [],
  seeds: {
    dev: 'src/zerospin/seeds.ts',
    production: 'src/zerospin/seeds.production.ts',
  },
});

declare function makeSystemConfig(props: {
  entry: string;
  supportedPredecessors: readonly string[];
  seeds: {
    dev: string;
    production: string;
  };
}): unknown;

// seeds.ts exports the Effect returned by makeSeeds:
export const seeds = makeSeeds({
  system,
  aggregates: {},
  services: {
    catalog: [
      catalogService.makeCommand({
        contractName: 'createProduct',
        payload: product,
      }),
    ],
  },
});

declare const system: unknown;
declare const catalogService: {
  makeCommand: (props: unknown) => unknown;
};
declare const product: unknown;
declare function makeSeeds(props: unknown): unknown;
