"use client";

import { Image } from "@unpic/react";
import { useState } from "react";
import { ActivityCalendar } from "react-activity-calendar";
import useSWR from "swr";
import {
  AlertCircle,
  BookOpen,
  GitBranch,
  Link as LinkIcon,
  MapPin,
  Quote,
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

/** Fixed light palette so every GitHub brick reads consistently for now. */
const profileCardShellClass =
  "h-full min-h-0 w-full gap-1 overflow-hidden rounded-none border border-zinc-200 bg-white py-3 text-zinc-900 shadow-none";
const profileMutedClass = "text-zinc-500";
const profileHeadingClass = "text-zinc-950";

function generateContributionData() {
  const days = 26 * 7;
  const startDate = new Date("2025-11-02T00:00:00.000Z");
  const contributions = [];

  for (let dayIndex = 0; dayIndex < days; dayIndex++) {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + dayIndex);

    const level = (dayIndex * 7 + (dayIndex % 6)) % 5;
    contributions.push({
      date: date.toISOString().slice(0, 10),
      count: level * 3,
      level,
    });
  }

  return contributions;
}

function ContributionGraph() {
  const contributions = generateContributionData();

  return (
    <div>
      <ActivityCalendar
        data={contributions}
        blockMargin={2}
        blockSize={9}
        colorScheme="light"
        fontSize={10}
        showTotalCount={false}
        showWeekdayLabels={["mon", "wed", "fri"]}
      />
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
        className="border-zinc-300 bg-white text-zinc-700 transition-all hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950"
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
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-medium text-zinc-900">
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
              <div className="h-16 w-16 rounded-full bg-zinc-200" />
              <div className="space-y-2">
                <div className="h-5 w-32 rounded bg-zinc-200" />
                <div className="h-4 w-24 rounded bg-zinc-200" />
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
      <CardHeader className="shrink-0 px-4 pb-0 pt-0">
        <div className="flex items-center gap-4">
          <ProfileAvatar src={avatarSrc} alt={displayName} fallback={avatarFallback} />

          <div className="min-w-0 flex-1">
            <h2 className={`text-xl font-semibold ${profileHeadingClass}`}>{displayName}</h2>
            <p className={profileMutedClass}>@{user.login}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto px-4 pb-2">
        <div className={`flex flex-col gap-2 text-sm ${profileMutedClass}`}>
          {user.bio && (
            <div className="flex items-center gap-1">
              <Quote className="h-4 w-4 shrink-0" />
              <span>{user.bio}</span>
            </div>
          )}
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
              className={`flex items-center gap-1 transition-colors hover:text-blue-600 ${profileMutedClass}`}
            >
              <LinkIcon className="h-4 w-4 shrink-0" />
              <span>{user.blog.replace(/^https?:\/\//, "")}</span>
            </a>
          )}
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
        </div>

        <div className="mt-auto">
          <ContributionGraph />
        </div>
      </CardContent>
    </Card>
  );
}
