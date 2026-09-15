import { RpcTarget } from "capnweb";

import type { ILinktreeScrapePayload, IRpcEither } from "./types.public";

export declare class ScraperApi extends RpcTarget {
  linktreeRepo(): RpcTarget & {
    scrape(url: string): Promise<IRpcEither<ILinktreeScrapePayload>>;
  };
}
