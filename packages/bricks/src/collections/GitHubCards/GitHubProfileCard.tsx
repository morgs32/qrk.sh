"use client";

import { Image } from "@unpic/react";
import { useState } from "react";
import useSWR from "swr";
import {
  AlertCircle,
  BookOpen,
  GitBranch,
  Link as LinkIcon,
  MapPin,
  RefreshCw,
  Users,
} from "lucide-react";

import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader } from "../../ui/card";

const GITHUB_PROFILE_API_URL = "https://api.github.com/users/morgs32";

interface GitHubUser {
  login: string;
  name: string;
  avatar_url: string;
  bio: string;
  location: string;
  blog: string;
  public_repos: number;
  followers: number;
  following: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/** GitHub dark UI — fixed palette so the brick reads dark regardless of app theme. */
const profileCardShellClass =
  "h-full min-h-0 w-full gap-3 overflow-hidden rounded-none border border-[#30363d] bg-[#0d1117] py-4 text-[#c9d1d9] shadow-none";
const profileMutedClass = "text-[#8b949e]";
const profileHeadingClass = "text-[#f0f6fc]";

function generateContributionData() {
  const weeks = 26;
  const contributions: number[][] = [];

  for (let week = 0; week < weeks; week++) {
    const weekData: number[] = [];
    for (let day = 0; day < 7; day++) {
      const rand = Math.random();
      if (rand < 0.3) weekData.push(0);
      else if (rand < 0.5) weekData.push(1);
      else if (rand < 0.7) weekData.push(2);
      else if (rand < 0.85) weekData.push(3);
      else weekData.push(4);
    }
    contributions.push(weekData);
  }

  return contributions;
}

/** GitHub contribution graph scale (dark theme). */
const contributionColors = [
  "bg-[#161b22]",
  "bg-[#0e4429]",
  "bg-[#006d32]",
  "bg-[#26a641]",
  "bg-[#39d353]",
];

const months = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr"];
const days = ["Mon", "Wed", "Fri"];

function ContributionGraph() {
  const contributions = generateContributionData();

  return (
    <div className="space-y-2">
      <p className={`text-sm ${profileMutedClass}`}>2,560 contributions in the last year</p>

      <div className="overflow-x-auto">
        <div className="inline-block">
          <div className="mb-1 ml-8 flex">
            {months.map((month) => (
              <span
                key={month}
                className={`text-xs ${profileMutedClass}`}
                style={{ width: `${(26 / 6) * 13}px` }}
              >
                {month}
              </span>
            ))}
          </div>

          <div className="flex gap-0.5">
            <div className="flex w-7 flex-col justify-around pr-1">
              {days.map((day) => (
                <span key={day} className={`text-xs leading-3 ${profileMutedClass}`}>
                  {day}
                </span>
              ))}
            </div>

            <div className="flex gap-[3px]">
              {contributions.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-[3px]">
                  {week.map((level, dayIndex) => (
                    <div
                      key={dayIndex}
                      className={`h-[11px] w-[11px] rounded-full ${contributionColors[level]}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 flex items-center justify-end gap-1">
            <span className={`mr-1 text-xs ${profileMutedClass}`}>Less</span>
            {contributionColors.map((color, i) => (
              <div key={i} className={`h-[11px] w-[11px] rounded-full ${color}`} />
            ))}
            <span className={`ml-1 text-xs ${profileMutedClass}`}>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GitHubProfileErrorState(props: { onRetry: () => void }) {
  const { onRetry } = props;

  return (
    <>
      <div className="relative mb-3">
        <div className="absolute inset-0 animate-pulse rounded-full bg-red-500/20 blur-lg" />
        <div className="relative rounded-full border border-red-500/20 bg-red-500/10 p-3">
          <AlertCircle className="h-7 w-7 text-red-400" aria-hidden />
        </div>
      </div>

      <div className="relative mb-3">
        <GitBranch className="h-10 w-10 text-zinc-600" aria-hidden />
        <div className="absolute -bottom-0.5 -right-0.5 rounded-full bg-red-500 p-0.5">
          <AlertCircle className="h-3 w-3 text-white" aria-hidden />
        </div>
      </div>

      <h2 className={`mb-1.5 text-center text-base font-medium ${profileHeadingClass}`}>
        Failed to load GitHub profile
      </h2>
      <p className="mb-4 max-w-[min(100%,16rem)] text-center text-xs text-zinc-500">
        We couldn&apos;t fetch the profile data. Please check your connection and try again.
      </p>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-zinc-700 bg-transparent text-zinc-300 transition-all hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100"
        onClick={onRetry}
      >
        <RefreshCw className="h-4 w-4" />
        Try Again
      </Button>
    </>
  );
}

function ProfileAvatar(props: { src: string; alt: string; fallback: string }) {
  const { src, alt, fallback } = props;
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#21262d] text-sm font-medium text-[#f0f6fc]">
        {fallback}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={64}
      height={64}
      className="h-16 w-16 shrink-0 rounded-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export function GitHubProfileCard() {
  const {
    data: user,
    error,
    isLoading,
    mutate,
  } = useSWR<GitHubUser>(GITHUB_PROFILE_API_URL, fetcher);

  if (isLoading) {
    return (
      <Card className={profileCardShellClass}>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-[#21262d]" />
              <div className="space-y-2">
                <div className="h-5 w-32 rounded bg-[#21262d]" />
                <div className="h-4 w-24 rounded bg-[#21262d]" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // API error bodies (rate limit, etc.) are JSON without `login`; don’t treat as a user.
  if (error || !user || typeof user.login !== "string" || user.login.length === 0) {
    return (
      <Card className={`${profileCardShellClass} flex min-h-0 flex-col`}>
        <CardContent className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto px-3 py-4 text-center">
          <GitHubProfileErrorState onRetry={() => void mutate()} />
        </CardContent>
      </Card>
    );
  }

  const displayName = user.name || user.login;
  const avatarFallback = user.login.slice(0, 2).toUpperCase();
  const avatarSrc = typeof user.avatar_url === "string" ? user.avatar_url : "";

  return (
    <Card className={profileCardShellClass}>
      <CardHeader className="shrink-0 px-4 pb-2 pt-0">
        <div className="flex items-start gap-4">
          <ProfileAvatar src={avatarSrc} alt={displayName} fallback={avatarFallback} />

          <div className="min-w-0 flex-1">
            <h2 className={`text-xl font-semibold ${profileHeadingClass}`}>{displayName}</h2>
            <p className={profileMutedClass}>@{user.login}</p>
            {user.bio && <p className={`mt-1 text-sm ${profileMutedClass}`}>{user.bio}</p>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 space-y-3 overflow-auto px-4 pb-4">
        <div className={`flex flex-wrap gap-4 text-sm ${profileMutedClass}`}>
          {user.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{user.location}</span>
            </div>
          )}
          {user.blog && (
            <a
              href={user.blog.startsWith("http") ? user.blog : `https://${user.blog}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1 transition-colors hover:text-[#58a6ff] ${profileMutedClass}`}
            >
              <LinkIcon className="h-4 w-4 shrink-0" />
              <span>{user.blog.replace(/^https?:\/\//, "")}</span>
            </a>
          )}
        </div>

        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-1">
            <Users className={`h-4 w-4 shrink-0 ${profileMutedClass}`} />
            <span className={`font-medium ${profileHeadingClass}`}>{user.followers}</span>
            <span className={profileMutedClass}>followers</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={`font-medium ${profileHeadingClass}`}>{user.following}</span>
            <span className={profileMutedClass}>following</span>
          </div>
          <div className="flex items-center gap-1">
            <BookOpen className={`h-4 w-4 shrink-0 ${profileMutedClass}`} />
            <span className={`font-medium ${profileHeadingClass}`}>{user.public_repos}</span>
            <span className={profileMutedClass}>repos</span>
          </div>
        </div>

        <div className="border-t border-[#30363d] pt-2">
          <ContributionGraph />
        </div>
      </CardContent>
    </Card>
  );
}
