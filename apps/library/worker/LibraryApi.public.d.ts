import type { Spec } from "@json-render/core";
import { RpcTarget } from "capnweb";

import type {
  IFigmaFilePreviewPayload,
  IGitHubRepoPayload,
  IGitHubScrapePayload,
  IGooglePlaceDetails,
  IGooglePlaceSuggestion,
  IInstagramScrapePayload,
  ILinkPreview,
  IRpcEither,
} from "./types.public";

export declare class LibraryApi extends RpcTarget {
  instagramBackend(): RpcTarget & {
    scrape(url: string): Promise<IRpcEither<IInstagramScrapePayload>>;
  };

  githubBackend(): RpcTarget & {
    getProfile(url: string): Promise<IRpcEither<IGitHubScrapePayload>>;
    getRepo(url: string): Promise<IRpcEither<IGitHubRepoPayload>>;
  };

  figmaBackend(): RpcTarget & {
    getThumbnail(url: string): Promise<IRpcEither<IFigmaFilePreviewPayload>>;
  };

  googlePlacesBackend(): RpcTarget & {
    autocomplete(query: string): Promise<IRpcEither<ReadonlyArray<IGooglePlaceSuggestion>>>;
    getPlace(googlePlaceId: string): Promise<IRpcEither<IGooglePlaceDetails>>;
  };

  linkBackend(): RpcTarget & {
    getPreview(url: string): Promise<IRpcEither<ILinkPreview>>;
  };

  streamlineBackend(): RpcTarget & {
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

  generateSpec(
    moduleId: string,
    prompt: string,
    state: unknown,
    currentSpec: Spec | null,
  ): Promise<IRpcEither<Spec>>;
}
