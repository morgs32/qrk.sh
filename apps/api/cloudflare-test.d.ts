/// <reference types="@cloudflare/vitest-pool-workers/types" />

declare module "cloudflare:test" {
  export const env: Env;
  export const SELF: Fetcher;
}
