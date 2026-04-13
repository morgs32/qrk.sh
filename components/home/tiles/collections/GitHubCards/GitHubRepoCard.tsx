"use client";

import useSWR from "swr";
import { GitFork, Monitor, Star } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

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

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function GitHubRepoCard() {
  const { data, isLoading } = useSWR<RepoData>(
    `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`,
    fetcher,
  );

  if (isLoading) {
    return (
      <Card className="h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border border-zinc-700 bg-zinc-800 py-0 shadow-none">
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-1/2 rounded bg-zinc-700" />
            <div className="h-4 w-3/4 rounded bg-zinc-700" />
            <div className="mt-4 h-4 w-1/4 rounded bg-zinc-700" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.name === undefined) {
    return (
      <Card className="h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border border-zinc-700 bg-zinc-800 py-0 shadow-none">
        <CardContent className="p-4">
          <p className="text-zinc-400">Repository not found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border border-zinc-700 bg-zinc-800 py-0 shadow-none transition-colors hover:border-zinc-600">
      <a href={data.html_url} target="_blank" rel="noopener noreferrer" className="block h-full min-h-0">
        <CardContent className="flex h-full min-h-0 flex-col p-4">
          <div className="mb-2 flex items-center gap-2">
            <Monitor className="h-5 w-5 text-zinc-400" />
            <h3 className="text-lg font-semibold text-zinc-100">{data.name}</h3>
          </div>

          <p className="text-zinc-400 mb-4 min-h-0 flex-1 text-sm">{data.description || "No description provided"}</p>

          <div className="text-zinc-400 mt-auto flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4" />
              <span>{data.stargazers_count}</span>
            </div>
            {data.forks_count > 0 && (
              <div className="flex items-center gap-1">
                <GitFork className="h-4 w-4" />
                <span>{data.forks_count}</span>
              </div>
            )}
            {data.language && (
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-yellow-400" />
                <span>{data.language}</span>
              </div>
            )}
          </div>
        </CardContent>
      </a>
    </Card>
  );
}
