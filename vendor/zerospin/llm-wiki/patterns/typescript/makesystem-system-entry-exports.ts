import { makeSystem } from '@zerospin/sdk';

/**
 * Export the inferred makeSystem binding — do not annotate : ISystem or spread outside factory.
 *
 * @bad `export const system: ISystem = makeSystem({ name: 'shopping' })`.
 */
export const system = makeSystem({
  name: 'shopping',
  version: '1.0.0',
  aggregates: {},
  services: {},
});

declare function makeSystem(props: {
  name: string;
  version: string;
  aggregates: Record<string, unknown>;
  services: Record<string, unknown>;
}): unknown;
