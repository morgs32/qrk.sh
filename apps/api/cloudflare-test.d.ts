declare module "cloudflare:test" {
  import type { IApiEnv } from "./types";

  export const env: IApiEnv;
  export const SELF: Fetcher;
}
