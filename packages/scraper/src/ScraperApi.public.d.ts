import { RpcTarget } from "capnweb";
import { BrandTypeId } from "effect/Brand";

import type {
  IBeaconsScrapePayload,
  IFigmaFilePreviewPayload,
  IGitHubScrapePayload,
  IGooglePlaceDetails,
  IGooglePlaceSuggestion,
  IInstagramScrapePayload,
  ILinkPreview,
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

  googlePlacesRepo(): {
    [BrandTypeId]: "TargetApi";
    autocomplete(query: string): Promise<IRpcEither<ReadonlyArray<IGooglePlaceSuggestion>>>;
    getPlace(googlePlaceId: string): Promise<IRpcEither<IGooglePlaceDetails>>;
  };

  linkRepo(): {
    [BrandTypeId]: "TargetApi";
    getPreview(url: string): Promise<IRpcEither<ILinkPreview>>;
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

  streamlineRepo(): {
    [BrandTypeId]: "TargetApi";
    search(
      query: string,
      offset: number,
      limit: number,
    ): Promise<
      IRpcEither<{
        query: string;
        results: ReadonlyArray<{
          hash: string;
          name: string;
          imagePreviewUrl: string;
          familyName: string;
          isFree: boolean;
        }>;
        pagination: {
          total: number;
          hasMore: boolean;
          offset: number;
          nextOffset: number;
        };
      }>
    >;
    getSvg(hash: string): Promise<IRpcEither<{ hash: string; name: string; svg: string }>>;
  };
}
