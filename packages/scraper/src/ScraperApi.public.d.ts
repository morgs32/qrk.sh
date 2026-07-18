import { RpcTarget } from "capnweb";
import { BrandTypeId } from "effect/Brand";

import type {
  IBeaconsScrapePayload,
  IFigmaFilePreviewPayload,
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

  figmaRepo(): {
    [BrandTypeId]: "TargetApi";
    getDesign(url: string): Promise<IRpcEither<IFigmaFilePreviewPayload>>;
    getBoard(url: string): Promise<IRpcEither<IFigmaFilePreviewPayload>>;
    getSlides(url: string): Promise<IRpcEither<IFigmaFilePreviewPayload>>;
    getPrototype(url: string): Promise<IRpcEither<IFigmaFilePreviewPayload>>;
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
