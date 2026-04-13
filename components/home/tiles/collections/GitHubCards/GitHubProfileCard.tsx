"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR from "swr";
import { BookOpen, Link as LinkIcon, MapPin, Users } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";

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

const contributionColors = [
  "bg-zinc-100 dark:bg-zinc-800",
  "bg-green-200 dark:bg-green-900",
  "bg-green-400 dark:bg-green-700",
  "bg-green-500 dark:bg-green-600",
  "bg-green-700 dark:bg-green-500",
];

const months = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr"];
const days = ["Mon", "Wed", "Fri"];

function ContributionGraph() {
  const contributions = generateContributionData();

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">2,560 contributions in the last year</p>

      <div className="overflow-x-auto">
        <div className="inline-block">
          <div className="mb-1 ml-8 flex">
            {months.map((month) => (
              <span
                key={month}
                className="text-muted-foreground text-xs"
                style={{ width: `${(26 / 6) * 13}px` }}
              >
                {month}
              </span>
            ))}
          </div>

          <div className="flex gap-0.5">
            <div className="flex w-7 flex-col justify-around pr-1">
              {days.map((day) => (
                <span key={day} className="text-muted-foreground text-xs leading-3">
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
                      className={`h-[11px] w-[11px] rounded-sm ${contributionColors[level]}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 flex items-center justify-end gap-1">
            <span className="text-muted-foreground mr-1 text-xs">Less</span>
            {contributionColors.map((color, i) => (
              <div key={i} className={`h-[11px] w-[11px] rounded-sm ${color}`} />
            ))}
            <span className="text-muted-foreground ml-1 text-xs">More</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileAvatar(props: { src: string; alt: string; fallback: string }) {
  const { src, alt, fallback } = props;
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="bg-muted flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-sm font-medium">
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
  const { data: user, error, isLoading } = useSWR<GitHubUser>(GITHUB_PROFILE_API_URL, fetcher);

  if (isLoading) {
    return (
      <Card className="h-full min-h-0 w-full gap-3 overflow-hidden rounded-none border-0 py-4 shadow-none">
        <CardContent className="p-4">
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-4">
              <div className="bg-muted h-16 w-16 rounded-full" />
              <div className="space-y-2">
                <div className="bg-muted h-5 w-32 rounded" />
                <div className="bg-muted h-4 w-24 rounded" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !user) {
    return (
      <Card className="h-full min-h-0 w-full gap-3 overflow-hidden rounded-none border-0 py-4 shadow-none">
        <CardContent className="p-4">
          <p className="text-destructive">Failed to load GitHub profile</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full min-h-0 w-full gap-3 overflow-hidden rounded-none border-0 py-4 shadow-none">
      <CardHeader className="shrink-0 px-4 pb-2 pt-0">
        <div className="flex items-start gap-4">
          <ProfileAvatar
            src={user.avatar_url}
            alt={user.name || user.login}
            fallback={user.login.slice(0, 2).toUpperCase()}
          />

          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">{user.name || user.login}</h2>
            <p className="text-muted-foreground">@{user.login}</p>
            {user.bio && <p className="text-foreground/80 mt-1 text-sm">{user.bio}</p>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 space-y-3 overflow-auto px-4 pb-4">
        <div className="text-muted-foreground flex flex-wrap gap-4 text-sm">
          {user.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>{user.location}</span>
            </div>
          )}
          {user.blog && (
            <a
              href={user.blog.startsWith("http") ? user.blog : `https://${user.blog}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <LinkIcon className="h-4 w-4" />
              <span>{user.blog.replace(/^https?:\/\//, "")}</span>
            </a>
          )}
        </div>

        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-1">
            <Users className="text-muted-foreground h-4 w-4" />
            <span className="font-medium">{user.followers}</span>
            <span className="text-muted-foreground">followers</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-medium">{user.following}</span>
            <span className="text-muted-foreground">following</span>
          </div>
          <div className="flex items-center gap-1">
            <BookOpen className="text-muted-foreground h-4 w-4" />
            <span className="font-medium">{user.public_repos}</span>
            <span className="text-muted-foreground">repos</span>
          </div>
        </div>

        <div className="border-t pt-2">
          <ContributionGraph />
        </div>
      </CardContent>
    </Card>
  );
}
