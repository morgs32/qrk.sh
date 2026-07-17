/**
 * Config seeds are a module path — not imported Effect values at config load time.
 *
 * @bad `import { productSeeds } from './seeds'` and pass resolved commands in makeSystemConfig.
 * @bad `runSync` seeds when the config file loads.
 */
export default makeSystemConfig({
  entry: 'src/zerospin/system.ts',
  seeds: 'src/zerospin/seeds.ts',
});

declare function makeSystemConfig(props: {
  entry: string;
  seeds: string;
}): unknown;

// seeds.ts exports the Effect returned by makeSeeds:
export const seeds = makeSeeds({
  system,
  accounts: {},
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
