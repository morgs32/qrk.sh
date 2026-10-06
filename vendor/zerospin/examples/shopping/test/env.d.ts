import type { ShoppingTestProvider } from './support/ShoppingProvidersTest';

declare global {
  namespace Cloudflare {
    interface Env {
      SHOPPING_TEST_PROVIDER: DurableObjectNamespace<ShoppingTestProvider>;
    }
  }
}
