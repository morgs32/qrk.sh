import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { IPageType, IScrapeStatus } from "./types";

export const scrapeJobs = sqliteTable("scrape_jobs", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  pageType: text("page_type").$type<IPageType>().notNull(),
  status: text("status").$type<IScrapeStatus>().notNull(),
  attemptCount: integer("attempt_count").notNull(),
  payload: text("payload", { mode: "json" }).$type<unknown>(),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
