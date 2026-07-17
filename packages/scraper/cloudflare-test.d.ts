declare module "cloudflare:test" {
  import type { IScraperEnv } from "./src/types";

  export const env: IScraperEnv & Readonly<{ SCRAPER_LIVE_GITHUB_URL: string }>;
  export const SELF: Fetcher;
}
