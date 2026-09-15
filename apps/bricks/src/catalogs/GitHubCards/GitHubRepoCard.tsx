"use client";

import useSWR from "swr";
import { Schema } from "effect";
import { GitFork, Monitor, Star } from "lucide-react";

import { Card, CardContent } from "../../ui/card";

const GITHUB_REPO_OWNER = "morgs32";
const GITHUB_REPO_NAME = "ink-steps";

interface RepoData {
  name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  html_url: string;
}

const RepoDataSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  stargazers_count: Schema.Number,
  forks_count: Schema.Number,
  language: Schema.NullOr(Schema.String),
  html_url: Schema.String,
}) satisfies Schema.Schema<RepoData>;

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json();
  return Schema.decodeUnknownSync(RepoDataSchema)(data, { onExcessProperty: "ignore" });
};

export function GitHubRepoCard({ size = "sm" }: { size?: "xs" | "sm" }) {
  const { data, isLoading } = useSWR<RepoData>(
    `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`,
    fetcher,
  );

  if (isLoading) {
    return (
      <Card className="h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border border-zinc-200 bg-white py-0 shadow-none">
        <CardContent className={size === "xs" ? "flex h-full flex-col p-3" : "p-4"}>
          <div
            className={
              size === "xs" ? "flex h-full animate-pulse flex-col gap-2" : "animate-pulse space-y-3"
            }
          >
            <div
              className={
                size === "xs" ? "h-3 w-1/2 rounded bg-zinc-200" : "h-5 w-1/2 rounded bg-zinc-200"
              }
            />
            <div
              className={
                size === "xs" ? "h-2.5 w-3/4 rounded bg-zinc-200" : "h-4 w-3/4 rounded bg-zinc-200"
              }
            />
            <div
              className={
                size === "xs"
                  ? "mt-auto h-3 w-1/4 rounded bg-zinc-200"
                  : "mt-4 h-4 w-1/4 rounded bg-zinc-200"
              }
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.name === undefined) {
    return (
      <Card className="h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border border-zinc-200 bg-white py-0 shadow-none">
        <CardContent className={size === "xs" ? "p-3" : "p-4"}>
          <p className={size === "xs" ? "text-xs text-zinc-500" : "text-zinc-500"}>
            Repository not found
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border border-zinc-200 bg-white py-0 shadow-none transition-colors hover:border-zinc-300">
      <a
        href={data.html_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block h-full min-h-0"
      >
        <CardContent
          className={
            size === "xs"
              ? "flex h-full min-h-0 min-w-0 flex-col gap-2 p-3"
              : "flex h-full min-h-0 flex-col p-4"
          }
        >
          <div
            className={
              size === "xs"
                ? "flex min-w-0 shrink-0 items-center gap-1.5"
                : "mb-2 flex items-center gap-2"
            }
          >
            <Monitor
              className={
                size === "xs" ? "size-3.5 shrink-0 text-zinc-500" : "h-5 w-5 text-zinc-500"
              }
            />
            <h3
              className={
                size === "xs"
                  ? "min-w-0 truncate text-sm font-semibold text-zinc-950"
                  : "text-lg font-semibold text-zinc-950"
              }
            >
              {data.name}
            </h3>
          </div>

          <p
            className={
              size === "xs"
                ? "min-w-0 shrink-0 truncate text-xs text-zinc-500"
                : "text-zinc-500 mb-4 min-h-0 flex-1 text-sm"
            }
          >
            {data.description || "No description provided"}
          </p>

          <div
            className={
              size === "xs"
                ? "mt-auto flex min-w-0 shrink-0 items-center gap-2 text-xs text-zinc-500"
                : "text-zinc-500 mt-auto flex items-center gap-4 text-sm"
            }
          >
            <div
              className={
                size === "xs" ? "flex shrink-0 items-center gap-1" : "flex items-center gap-1"
              }
            >
              <Star className={size === "xs" ? "size-3 shrink-0" : "h-4 w-4"} />
              <span>{data.stargazers_count}</span>
            </div>
            {data.forks_count > 0 && (
              <div
                className={
                  size === "xs" ? "flex shrink-0 items-center gap-1" : "flex items-center gap-1"
                }
              >
                <GitFork className={size === "xs" ? "size-3 shrink-0" : "h-4 w-4"} />
                <span>{data.forks_count}</span>
              </div>
            )}
            {data.language && (
              <div
                className={
                  size === "xs" ? "flex min-w-0 items-center gap-1" : "flex items-center gap-1.5"
                }
              >
                <span
                  className={
                    size === "xs"
                      ? "size-2 shrink-0 rounded-full bg-yellow-400"
                      : "h-3 w-3 rounded-full bg-yellow-400"
                  }
                />
                <span className={size === "xs" ? "truncate" : undefined}>{data.language}</span>
              </div>
            )}
          </div>
        </CardContent>
      </a>
    </Card>
  );
}
