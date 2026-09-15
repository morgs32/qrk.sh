import { newWorkersRpcResponse } from "capnweb";

import { BeaconsRepo } from "./BeaconsRepo";
import { BrowserHost } from "./BrowserHost";
import { GitHubRepo } from "./GitHubRepo";
import { FigmaRepo } from "./FigmaRepo";
import { GooglePlacesRepo } from "./GooglePlacesRepo";
import { InstagramRepo } from "./InstagramRepo";
import { LinktreeRepo } from "./LinktreeRepo";
import { LinkRepo } from "./LinkRepo";
import { ScraperApi } from "./ScraperApi";
import { StreamlineRepo } from "./StreamlineRepo";
import { TikTokRepo } from "./TikTokRepo";
import { TruthSocialRepo } from "./TruthSocialRepo";
import type { IScraperEnv } from "./types";
import { YouTubeRepo } from "./YouTubeRepo";

export {
  BeaconsRepo,
  BrowserHost,
  FigmaRepo,
  GitHubRepo,
  GooglePlacesRepo,
  InstagramRepo,
  LinktreeRepo,
  LinkRepo,
  StreamlineRepo,
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
