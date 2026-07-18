import type { BrowserWorker } from "@cloudflare/puppeteer";

export type IJsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<null | boolean | number | string | object>
  | Readonly<{ [key: string]: null | boolean | number | string | object }>;

export type ILinktreeScrapePayload = Readonly<{
  props: Readonly<{
    pageProps: Readonly<{
      account: Readonly<{
        username: string;
        [key: string]: IJsonValue;
      }>;
      [key: string]: IJsonValue;
    }>;
    [key: string]: IJsonValue;
  }>;
  [key: string]: IJsonValue;
}>;

export type IBeaconsScrapePayload = Readonly<{
  username: string;
  source: "embedded" | "rendered";
  data: IJsonValue;
}>;

export type IInstagramScrapePayload = Readonly<{
  username: string;
  data: IJsonValue;
}>;

export type IGitHubScrapePayload = Readonly<{
  login: string;
  [key: string]: IJsonValue;
}>;

export type IFigmaFilePreviewPayload = Readonly<{
  title: string;
  url: string;
  thumbnail_url: string | null;
  thumbnail_width: number | null;
  thumbnail_height: number | null;
  [key: string]: IJsonValue;
}>;

export type IGooglePlaceSuggestion = Readonly<{
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}>;

export type IGooglePlaceDetails = Readonly<{
  googlePlaceId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}>;

export type ITikTokScrapePayload = Readonly<{
  username: string;
  data: IJsonValue;
}>;

export type IYouTubeScrapePayload = Readonly<{
  handle: string;
  data: IJsonValue;
}>;

export type ITruthSocialScrapePayload = Readonly<{
  username: string;
  acct: string;
  [key: string]: IJsonValue;
}>;

export type IScrapeError = Readonly<{
  code:
    | "invalid-scrape-request"
    | "scrape-persistence-failed"
    | "unsupported-page-shape"
    | "profile-unavailable"
    | "profile-identity-mismatch"
    | "file-unavailable"
    | "file-type-mismatch"
    | "place-unavailable"
    | "provider-configuration-error"
    | "scrape-transient-failure";
  message: string;
  retryable?: boolean;
}>;

export type IRpcEither<RIGHT> =
  | Readonly<{ _tag: "Left"; left: IScrapeError }>
  | Readonly<{ _tag: "Right"; right: RIGHT }>;

export interface IScraperEnv {
  BROWSER: BrowserWorker;
  BROWSER_HOST: DurableObjectNamespace<import("./BrowserHost").BrowserHost>;
  LINKTREE_REPO: DurableObjectNamespace<import("./LinktreeRepo").LinktreeRepo>;
  BEACONS_REPO: DurableObjectNamespace<import("./BeaconsRepo").BeaconsRepo>;
  INSTAGRAM_REPO: DurableObjectNamespace<import("./InstagramRepo").InstagramRepo>;
  GITHUB_REPO: DurableObjectNamespace<import("./GitHubRepo").GitHubRepo>;
  FIGMA_REPO: DurableObjectNamespace<import("./FigmaRepo").FigmaRepo>;
  GOOGLE_PLACES_REPO: DurableObjectNamespace<import("./GooglePlacesRepo").GooglePlacesRepo>;
  TIKTOK_REPO: DurableObjectNamespace<import("./TikTokRepo").TikTokRepo>;
  YOUTUBE_REPO: DurableObjectNamespace<import("./YouTubeRepo").YouTubeRepo>;
  TRUTH_SOCIAL_REPO: DurableObjectNamespace<import("./TruthSocialRepo").TruthSocialRepo>;
  GITHUB_TOKEN: string;
  FIGMA_TOKEN: string;
  GOOGLE_PLACES_API_KEY: string;
}
