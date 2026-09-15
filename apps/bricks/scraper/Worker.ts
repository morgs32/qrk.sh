import { newWorkersRpcResponse } from "capnweb";

import { BrowserHost } from "./BrowserHost";
import { FigmaRepo } from "../groups/figma/catalogs/thumbnail/FigmaRepo";
import { GitHubRepo } from "../groups/github/catalogs/profile/GitHubRepo";
import { GooglePlacesRepo } from "../groups/map/catalogs/place/GooglePlacesRepo";
import { InstagramRepo } from "../groups/instagram/catalogs/default/InstagramRepo";
import { LinkRepo } from "../groups/link/catalogs/default/LinkRepo";
import { ScraperApi } from "./ScraperApi";
import { StreamlineRepo } from "../groups/icon/catalogs/default/StreamlineRepo";
import { TikTokRepo } from "../groups/tiktok/catalogs/default/TikTokRepo";
import type { IScraperEnv } from "./types";

export {
  BrowserHost,
  FigmaRepo,
  GitHubRepo,
  GooglePlacesRepo,
  InstagramRepo,
  LinkRepo,
  StreamlineRepo,
  TikTokRepo,
};

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoint.
export default {
  fetch(request: Request, env: IScraperEnv): Promise<Response> {
    return newWorkersRpcResponse(request, new ScraperApi(env));
  },
} satisfies ExportedHandler<IScraperEnv>;
