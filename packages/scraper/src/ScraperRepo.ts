import { DurableObject } from "cloudflare:workers";
import { and, desc, eq, gt, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import { migrations } from "./migrations";
import { scrapeJobs } from "./scrapeJobs";
import type { IScrapeJob, IScrapeMessage, IScraperEnv } from "./types";

export class ScraperRepo extends DurableObject<IScraperEnv> {
  readonly #db;

  constructor(ctx: DurableObjectState, env: IScraperEnv) {
    super(ctx, env);
    this.#db = drizzle(ctx.storage, { schema: { scrapeJobs } });
    ctx.blockConcurrencyWhile(async () => {
      migrate(this.#db, { migrations });
    });
  }

  createJob(message: IScrapeMessage): IScrapeJob {
    const now = Date.now();
    const job: IScrapeJob = {
      ...message,
      status: "pending",
      attemptCount: 0,
      payload: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      expiredAt: null,
    };
    this.#db.insert(scrapeJobs).values(job).run();
    return job;
  }

  findOrCreateGitHubJob(message: IScrapeMessage): { id: string; created: boolean } {
    const now = Date.now();
    const existing = this.#db
      .select()
      .from(scrapeJobs)
      .where(
        and(
          eq(scrapeJobs.pageType, "github"),
          eq(scrapeJobs.url, message.url),
          or(
            eq(scrapeJobs.status, "pending"),
            and(eq(scrapeJobs.status, "completed"), gt(scrapeJobs.expiredAt, now)),
          ),
        ),
      )
      .orderBy(desc(scrapeJobs.createdAt))
      .get();
    if (existing !== undefined) {
      return { id: existing.id, created: false };
    }
    return { id: this.createJob(message).id, created: true };
  }

  getJob(id: string): IScrapeJob | null {
    return this.#db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id)).get() ?? null;
  }

  startAttempt(id: string): number {
    const current = this.getJob(id);
    if (current === null) {
      throw new Error(`Scrape job ${id} was not found`);
    }
    this.#db
      .update(scrapeJobs)
      .set({ attemptCount: current.attemptCount + 1, updatedAt: Date.now() })
      .where(eq(scrapeJobs.id, id))
      .run();
    return current.attemptCount + 1;
  }

  recordRetry(props: { id: string; error: string }): void {
    this.#db
      .update(scrapeJobs)
      .set({ status: "pending", payload: null, error: props.error, updatedAt: Date.now(), expiredAt: null })
      .where(eq(scrapeJobs.id, props.id))
      .run();
  }

  completeJob(props: { id: string; payload: unknown; expiredAt?: number }): void {
    this.#db
      .update(scrapeJobs)
      .set({ status: "completed", payload: props.payload, error: null, updatedAt: Date.now(), expiredAt: props.expiredAt ?? null })
      .where(eq(scrapeJobs.id, props.id))
      .run();
  }

  failJob(props: { id: string; error: string }): void {
    this.#db
      .update(scrapeJobs)
      .set({ status: "failed", payload: null, error: props.error, updatedAt: Date.now(), expiredAt: null })
      .where(eq(scrapeJobs.id, props.id))
      .run();
  }
}
