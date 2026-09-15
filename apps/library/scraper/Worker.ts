import { newWorkersRpcResponse } from "capnweb";

import { BrowserHost } from "./BrowserHost";
import { FigmaRepo } from "../modules/figmaThumbnail/FigmaRepo";
import { GitHubRepo } from "../modules/githubProfile/GitHubRepo";
import { GooglePlacesRepo } from "../modules/mapPlace/GooglePlacesRepo";
import { InstagramRepo } from "../modules/instagram/InstagramRepo";
import { LinkRepo } from "../modules/link/LinkRepo";
import { ScraperApi } from "./ScraperApi";
import { StreamlineRepo } from "../modules/icon/StreamlineRepo";
import { TikTokRepo } from "../modules/tiktok/TikTokRepo";
import type { IScraperEnv } from "./types";

export {
  BrowserHost,
  FigmaRepo,
  GitHubRepo,
  GooglePlacesRepo,
  InstagramRepo,
  LinkRepo,
  StreamlineRepo,
  TikTokRepo};

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoint.
export default {
  fetch(request: Request, env: IScraperEnv): Promise<Response> {
    return newWorkersRpcResponse(request, new ScraperApi(env));
  }} satisfies ExportedHandler<IScraperEnv>;
