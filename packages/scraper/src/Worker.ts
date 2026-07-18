import { newWorkersRpcResponse } from "capnweb";

import { BeaconsRepo } from "./BeaconsRepo";
import { BrowserHost } from "./BrowserHost";
import { GitHubRepo } from "./GitHubRepo";
import { FigmaRepo } from "./FigmaRepo";
import { InstagramRepo } from "./InstagramRepo";
import { LinktreeRepo } from "./LinktreeRepo";
import { ScraperApi } from "./ScraperApi";
import { TikTokRepo } from "./TikTokRepo";
import { TruthSocialRepo } from "./TruthSocialRepo";
import type { IScraperEnv } from "./types";
import { YouTubeRepo } from "./YouTubeRepo";

export {
  BeaconsRepo,
  BrowserHost,
  FigmaRepo,
  GitHubRepo,
  InstagramRepo,
  LinktreeRepo,
  TikTokRepo,
  TruthSocialRepo,
  YouTubeRepo,
};

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoint.
export default {
  fetch(request: Request, env: IScraperEnv): Promise<Response> {
    return newWorkersRpcResponse(request, new ScraperApi(env));
  },
} satisfies ExportedHandler<IScraperEnv>;
