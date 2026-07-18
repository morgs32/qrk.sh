import { RpcTarget } from "capnweb";
import { BrandTypeId } from "effect/Brand";

import type {
  IBeaconsScrapePayload,
  IGitHubScrapePayload,
  IInstagramScrapePayload,
  ILinktreeScrapePayload,
  IRpcEither,
  ITikTokScrapePayload,
  ITruthSocialScrapePayload,
  IYouTubeScrapePayload,
} from "./types.public";

export declare class ScraperApi extends RpcTarget {
  declare [BrandTypeId]: "Apis";

  linktreeRepo(): {
    [BrandTypeId]: "TargetApi";
    scrape(url: string): Promise<IRpcEither<ILinktreeScrapePayload>>;
  };

  beaconsRepo(): {
    [BrandTypeId]: "TargetApi";
    scrape(url: string): Promise<IRpcEither<IBeaconsScrapePayload>>;
  };

  instagramRepo(): {
    [BrandTypeId]: "TargetApi";
    scrape(url: string): Promise<IRpcEither<IInstagramScrapePayload>>;
  };

  githubRepo(): {
    [BrandTypeId]: "TargetApi";
    getProfile(url: string): Promise<IRpcEither<IGitHubScrapePayload>>;
  };

  tiktokRepo(): {
    [BrandTypeId]: "TargetApi";
    scrape(url: string): Promise<IRpcEither<ITikTokScrapePayload>>;
  };

  youtubeRepo(): {
    [BrandTypeId]: "TargetApi";
    scrape(url: string): Promise<IRpcEither<IYouTubeScrapePayload>>;
  };

  truthSocialRepo(): {
    [BrandTypeId]: "TargetApi";
    scrape(url: string): Promise<IRpcEither<ITruthSocialScrapePayload>>;
  };
}
