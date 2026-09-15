import { RpcTarget } from "capnweb";

import type {
  IFigmaFilePreviewPayload,
  IGitHubScrapePayload,
  IGooglePlaceDetails,
  IGooglePlaceSuggestion,
  IInstagramScrapePayload,
  ILinkPreview,
  IRpcEither,
  ITikTokScrapePayload,
} from "./types.public";

export declare class ScraperApi extends RpcTarget {
  instagramRepo(): RpcTarget & {
    scrape(url: string): Promise<IRpcEither<IInstagramScrapePayload>>;
  };

  githubRepo(): RpcTarget & {
    getProfile(url: string): Promise<IRpcEither<IGitHubScrapePayload>>;
  };

  figmaRepo(): RpcTarget & {
    getThumbnail(url: string): Promise<IRpcEither<IFigmaFilePreviewPayload>>;
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
