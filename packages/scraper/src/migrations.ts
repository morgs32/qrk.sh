export const migrations = {
  "20260716000000_create_scrape_jobs.sql": `
CREATE TABLE scrape_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  url TEXT NOT NULL,
  page_type TEXT NOT NULL CHECK (page_type IN ('linktree')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  payload TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`,
  "20260716010000_extend_scrape_jobs.sql": `
CREATE TABLE scrape_jobs_next (
  id TEXT PRIMARY KEY NOT NULL,
  url TEXT NOT NULL,
  page_type TEXT NOT NULL CHECK (page_type IN ('linktree', 'beacons', 'instagram', 'tiktok', 'youtube', 'truth-social')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  payload TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO scrape_jobs_next (id, url, page_type, status, attempt_count, payload, error, created_at, updated_at)
SELECT id, url, page_type, status, 0, payload, error, created_at, updated_at FROM scrape_jobs;
DROP TABLE scrape_jobs;
ALTER TABLE scrape_jobs_next RENAME TO scrape_jobs;
`,
};
