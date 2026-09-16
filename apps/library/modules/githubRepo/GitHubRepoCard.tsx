"use client";

import useSWR from "swr";
import { Schema } from "effect";
import { GitFork, Star } from "lucide-react";
import { cn } from "cn";

import { BrickFooter } from "../../components/brick/BrickFooter";
import { BrickShell } from "../../components/brick/BrickShell";
import { brickMetaIconClass, brickMutedClass, brickTitleClass } from "../../components/brick/brickTokens";

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
      <BrickShell className="min-w-0">
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
      </BrickShell>
    );
  }

  if (!data || data.name === undefined) {
    return (
      <BrickShell className="min-w-0">
        <p className={brickMutedClass}>Repository not found</p>
      </BrickShell>
    );
  }

  return (
    <BrickShell className="min-w-0">
      <h3 className={cn("min-w-0 shrink-0 break-words", brickTitleClass)}>
        <a
          href={data.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {data.name}
        </a>
      </h3>

      <p
        className={cn(
          "min-w-0 break-words",
          brickMutedClass,
          size === "xs" ? "shrink-0" : "min-h-0 flex-1",
        )}
      >
        {data.description || "No description provided"}
      </p>

      <BrickFooter className={size === "xs" ? "min-w-0 gap-2" : "gap-4"}>
        <div className="flex shrink-0 items-center gap-1">
          <Star className={brickMetaIconClass} />
          <span>{data.stargazers_count}</span>
        </div>
        {data.forks_count > 0 && (
          <div className="flex shrink-0 items-center gap-1">
            <GitFork className={brickMetaIconClass} />
            <span>{data.forks_count}</span>
          </div>
        )}
        {data.language && (
          <div className="flex min-w-0 items-center gap-1">
            <span className="size-2 shrink-0 rounded-full bg-yellow-400" />
            <span className="truncate">{data.language}</span>
          </div>
        )}
      </BrickFooter>
    </BrickShell>
  );
}
