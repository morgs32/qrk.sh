import type { Spec } from "@json-render/core";
import type { RpcTarget } from "capnweb";

import type {
  IFigmaFilePreviewPayload,
  IGitHubRepoPayload,
  IGitHubScrapePayload,
  IGooglePlaceDetails,
  IGooglePlaceSuggestion,
  IInstagramScrapePayload,
  ILinkPreview,
  IRpcEither,
} from "./types";

export declare class BricksApi extends RpcTarget {
  linkBackend(): RpcTarget & {
    getPreview(url: string): Promise<IRpcEither<ILinkPreview>>;
  };

  generateSpec(
    moduleId: string,
    prompt: string,
    state: unknown,
    currentSpec: Spec | null,
  ): Promise<IRpcEither<Spec>>;

  getInstagramProfile(url: string): Promise<IRpcEither<IInstagramScrapePayload>>;

  getGitHubProfile(url: string): Promise<IRpcEither<IGitHubScrapePayload>>;

  getGitHubRepo(url: string): Promise<IRpcEither<IGitHubRepoPayload>>;

  figmaBackend(): RpcTarget & {
    getThumbnail(url: string): Promise<IRpcEither<IFigmaFilePreviewPayload>>;
  };

  googlePlacesBackend(): RpcTarget & {
    autocomplete(query: string): Promise<IRpcEither<ReadonlyArray<IGooglePlaceSuggestion>>>;
    getPlace(googlePlaceId: string): Promise<IRpcEither<IGooglePlaceDetails>>;
  };
}
