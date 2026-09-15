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
  profileImageUrl: string;
  followersText: string;
  postImageUrl1: string;
  postImageUrl2: string;
  postImageUrl3: string;
  postImageUrl4: string;
}>;

export type IGitHubScrapePayload = Readonly<{
  login: string;
  [key: string]: IJsonValue;
}>;

export type ILinkPreview = Readonly<{
  url: string;
  title: string;
  description: string;
  siteName: string;
  imageUrl: string;
  iconUrl: string;
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
    | "link-unavailable"
    | "place-unavailable"
    | "provider-configuration-error"
    | "scrape-transient-failure";
  message: string;
  retryable?: boolean;
}>;

export type IRpcEither<RIGHT> =
  | Readonly<{ _tag: "Left"; left: IScrapeError }>
  | Readonly<{ _tag: "Right"; right: RIGHT }>;
