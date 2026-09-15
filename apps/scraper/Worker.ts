import { newWorkersRpcResponse } from "capnweb";

import { BrowserHost } from "./BrowserHost";
import { LinktreeRepo } from "./LinktreeRepo";
import { ScraperApi } from "./ScraperApi";
import type { IScraperEnv } from "./types";

export { BrowserHost, LinktreeRepo };

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoint.
export default {
  fetch(request: Request, env: IScraperEnv): Promise<Response> {
    return newWorkersRpcResponse(request, new ScraperApi(env));
  },
} satisfies ExportedHandler<IScraperEnv>;
