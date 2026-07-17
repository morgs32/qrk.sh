import type { BrowserWorker } from "@cloudflare/puppeteer";

export type IPageType =
  | "linktree"
  | "beacons"
  | "instagram"
  | "github"
  | "tiktok"
  | "youtube"
  | "truth-social";

export type IScrapeStatus = "pending" | "completed" | "failed";

export type IScrapeJob = Readonly<{
  id: string;
  url: string;
  pageType: IPageType;
  status: IScrapeStatus;
  attemptCount: number;
  payload: unknown | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  expiredAt: number | null;
}>;

export type IScrapeMessage = Readonly<{
  id: string;
  url: string;
  pageType: IPageType;
}>;

export type IScrapeError = Readonly<{
  code:
    | "invalid-scrape-request"
    | "scrape-job-not-found"
    | "scrape-persistence-failed"
    | "scrape-queue-failed"
    | "queue-page-type-mismatch"
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

export interface IScraperEnv {
  BROWSER: BrowserWorker;
  LINKTREE_QUEUE: Queue<IScrapeMessage>;
  BEACONS_QUEUE: Queue<IScrapeMessage>;
  INSTAGRAM_QUEUE: Queue<IScrapeMessage>;
  TIKTOK_QUEUE: Queue<IScrapeMessage>;
  YOUTUBE_QUEUE: Queue<IScrapeMessage>;
  TRUTH_SOCIAL_QUEUE: Queue<IScrapeMessage>;
  GITHUB_QUEUE: Queue<IScrapeMessage>;
  GITHUB_TOKEN: string;
  SCRAPER_REPO: DurableObjectNamespace<import("./ScraperRepo").ScraperRepo>;
}
