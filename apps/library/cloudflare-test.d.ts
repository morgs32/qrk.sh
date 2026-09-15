declare module "cloudflare:test" {
  import type { IScraperEnv } from "./worker/types";

  export const env: IScraperEnv;
  export const SELF: Fetcher;
}
