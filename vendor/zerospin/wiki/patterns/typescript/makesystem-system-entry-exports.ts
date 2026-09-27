import { makeSystem } from '@zerospin/sdk';

/**
 * Export the inferred makeSystem binding — do not annotate : ISystem or spread outside factory.
 *
 * @bad `export const system: ISystem = makeSystem({ name: 'shopping' })`.
 */
export const system = makeSystem({
  name: 'shopping',
  aggregates: {},
  services: {},
});

declare function makeSystem(props: {
  name: string;
  aggregates: Record<string, unknown>;
  services: Record<string, unknown>;
}): unknown;
