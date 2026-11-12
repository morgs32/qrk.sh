import type { Spec } from "@json-render/core";
import type { RpcTarget } from "capnweb";
import type { behanceImportSchema } from "../modules/behance/definition/behanceSchemas";

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

  getBehanceProfile(url: string): Promise<IRpcEither<typeof behanceImportSchema.Type>>;

  getOmniLinkData(url: string): Promise<IRpcEither<string>>;

  resolveSpotifyLink(url: string): Promise<IRpcEither<string>>;

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
