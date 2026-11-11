import type { BareFetcher, Fetcher } from "swr";
import "swr/_internal";

declare module "swr/_internal" {
  // Preserve SWR's generic declaration so provider and consumer share this optional field.
  interface PublicConfiguration<Data = any, Error = any, Fn extends Fetcher = BareFetcher> {
    uploadImage?: (file: File, options: { signal: AbortSignal }) => Promise<string>;
  }
}
