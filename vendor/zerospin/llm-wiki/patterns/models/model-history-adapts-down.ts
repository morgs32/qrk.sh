import { Effect } from 'effect';

/**
 * Adapt a complete current frontend resource directly down to each requested historical model shape.
 *
 * @bad Adapt a historical resource up during client delivery.
 * @bad Chain current through intermediate historical versions.
 * @bad Omit identity, timestamps, modelName, or the exact historical version from adapter output.
 */
export const CartItem = makeModel(
  {
    abbreviation: 'item',
    modelName: 'cartItem',
    version: '2.0.0',
    attributes: {
      amount: primitives.integer(),
      unit: primitives.enum({ values: ['item', 'case'] }),
    },
    indexes: [],
  },
  [
    {
      abbreviation: 'item',
      modelName: 'cartItem',
      version: '1.0.0',
      attributes: { quantity: primitives.integer() },
      indexes: [],
      adaptResource: ({
        resource,
      }: {
        resource: {
          id: string;
          modelName: string;
          createdAt: Date;
          updatedAt: Date;
          amount: number;
          unit: 'item' | 'case';
        };
      }) =>
        Effect.succeed({
          id: resource.id,
          modelName: resource.modelName,
          createdAt: resource.createdAt,
          updatedAt: resource.updatedAt,
          version: '1.0.0',
          quantity:
            resource.unit === 'case' ? resource.amount * 12 : resource.amount,
        }),
    },
  ],
);

declare function makeModel(
  props: unknown,
  history: readonly unknown[],
): unknown;
declare const primitives: {
  integer(): unknown;
  enum(props: { values: readonly string[] }): unknown;
};
