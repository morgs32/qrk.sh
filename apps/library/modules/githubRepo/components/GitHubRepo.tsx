"use client";

import useSWR from "swr";
import { Schema } from "effect";
import { GitFork, Star } from "lucide-react";

import { BrickBody } from "../../../components/brick/BrickBody";
import { BrickFooter } from "../../../components/brick/BrickFooter";
import { BrickShell } from "../../../components/brick/BrickShell";
import { brickMetaIconClass } from "../../../components/brick/brickTokens";

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

const LANGUAGE_DOT_COLOR: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Java: "#b07219",
  Ruby: "#701516",
  PHP: "#4F5D95",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Swift: "#ffac45",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  SCSS: "#c6538c",
  Less: "#1d365d",
  Makefile: "#427819",
  Dockerfile: "#384d54",
};

export function GitHubRepo() {
  const { data, isLoading } = useSWR<RepoData>(
    `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`,
    fetcher,
  );

  if (isLoading) {
    return (
      <BrickShell className="min-w-0">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-1/2 rounded bg-zinc-200" />
          <div className="h-4 w-3/4 rounded bg-zinc-200" />
          <div className="mt-4 h-4 w-1/4 rounded bg-zinc-200" />
        </div>
      </BrickShell>
    );
  }

  if (!data || data.name === undefined) {
    return (
      <BrickShell className="min-w-0">
        <p>Repository not found</p>
      </BrickShell>
    );
  }

  const description = data.description?.trim();

  return (
    <BrickShell className="min-w-0">
      <h3 className="min-w-0 shrink-0 break-words [margin-block-end:0]">{data.name}</h3>

      {description ? (
        <BrickBody>
          <p className="min-w-0 [margin-block-start:0] [overflow-wrap:anywhere]">{description}</p>
        </BrickBody>
      ) : (
        <div className="min-h-0 flex-1" />
      )}

      <BrickFooter className="gap-4">
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
            <span
              className="size-2 shrink-0 rounded-full"
              style={{
                backgroundColor: LANGUAGE_DOT_COLOR[data.language] ?? "#8b8b8b",
              }}
            />
            <span className="truncate">{data.language}</span>
          </div>
        )}
      </BrickFooter>
    </BrickShell>
  );
}
