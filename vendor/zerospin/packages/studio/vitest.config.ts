import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    'import.meta.env.ZEROSPIN_SYSTEM_SPEC': JSON.stringify(
      JSON.stringify({
        aggregates: {
          shopper: {
            '2.0.0': {
              name: 'shopper',
              version: '2.0.0',
              services: { catalog: '5.0.0' },
              models: {
                Product: {
                  modelName: 'Product',
                  version: '2.0.0',
                },
                CartItem: {
                  modelName: 'CartItem',
                  version: '1.1.0',
                },
              },
              contracts: {
                updateCartItemQuantity: {
                  commandName: 'updateCartItemQuantity',
                  version: '2.0.0',
                },
              },
            },
          },
        },
      }),
    ),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.node.spec.ts', 'src/**/*.react.spec.tsx'],
  },
});
