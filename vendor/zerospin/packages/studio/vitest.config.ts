import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    'import.meta.env.ZEROSPIN_SYSTEM_SPEC': JSON.stringify(
      JSON.stringify({
        version: '2.0.2',
        aggregates: {
          shopper: {
            name: 'shopper',
            models: {
              CartItem: {
                modelName: 'CartItem',
                version: '1.1.0',
                historicalDefinitions: [{ version: '1.0.0' }],
              },
            },
            contracts: {
              updateCartItemQuantity: {
                commandName: 'updateCartItemQuantity',
                version: '2.0.0',
                historicalDefinitions: [{ version: '1.0.0' }],
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
