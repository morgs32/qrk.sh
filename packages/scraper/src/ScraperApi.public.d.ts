import { RpcTarget } from "capnweb";

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
  linktreeRepo(): RpcTarget & {
    scrape(url: string): Promise<IRpcEither<ILinktreeScrapePayload>>;
  };

  beaconsRepo(): RpcTarget & {
    scrape(url: string): Promise<IRpcEither<IBeaconsScrapePayload>>;
  };

  instagramRepo(): RpcTarget & {
    scrape(url: string): Promise<IRpcEither<IInstagramScrapePayload>>;
  };

  githubRepo(): RpcTarget & {
    getProfile(url: string): Promise<IRpcEither<IGitHubScrapePayload>>;
  };

  figmaRepo(): RpcTarget & {
    getDesign(url: string): Promise<IRpcEither<IFigmaFilePreviewPayload>>;
    getBoard(url: string): Promise<IRpcEither<IFigmaFilePreviewPayload>>;
    getSlides(url: string): Promise<IRpcEither<IFigmaFilePreviewPayload>>;
    getPrototype(url: string): Promise<IRpcEither<IFigmaFilePreviewPayload>>;
  };

  googlePlacesRepo(): RpcTarget & {
    autocomplete(query: string): Promise<IRpcEither<ReadonlyArray<IGooglePlaceSuggestion>>>;
    getPlace(googlePlaceId: string): Promise<IRpcEither<IGooglePlaceDetails>>;
  };

  linkRepo(): RpcTarget & {
    getPreview(url: string): Promise<IRpcEither<ILinkPreview>>;
  };

  tiktokRepo(): RpcTarget & {
    scrape(url: string): Promise<IRpcEither<ITikTokScrapePayload>>;
  };

  youtubeRepo(): RpcTarget & {
    scrape(url: string): Promise<IRpcEither<IYouTubeScrapePayload>>;
  };

  truthSocialRepo(): RpcTarget & {
    scrape(url: string): Promise<IRpcEither<ITruthSocialScrapePayload>>;
  };

  streamlineRepo(): RpcTarget & {
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
