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

export type IScrapeError = Readonly<{
  code:
    | "invalid-scrape-request"
    | "scrape-persistence-failed"
    | "unsupported-page-shape"
    | "profile-unavailable"
    | "profile-identity-mismatch"
    | "scrape-transient-failure";
  message: string;
  retryable?: boolean;
}>;

export type IRpcEither<RIGHT> =
  | Readonly<{ _tag: "Left"; left: IScrapeError }>
  | Readonly<{ _tag: "Right"; right: RIGHT }>;
