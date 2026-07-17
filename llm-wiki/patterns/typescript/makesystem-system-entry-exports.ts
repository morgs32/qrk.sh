import { makeSystem } from '@zerospin/sdk';

/**
 * Export the inferred makeSystem binding — do not annotate : ISystem or spread outside factory.
 *
 * @bad `export const system: ISystem = makeSystem({ name: 'shopping' })`.
 */
export const system = makeSystem({
  name: 'shopping',
  accountControllers: {},
  serviceControllers: {},
});

declare function makeSystem(props: {
  name: string;
  accountControllers: Record<string, unknown>;
  serviceControllers: Record<string, unknown>;
}): unknown;
