"use client";

import { Image } from "@unpic/react";
import { useState } from "react";
import { BookOpen, Link as LinkIcon, MapPin, Quote, UserPlus, Users } from "lucide-react";

import { BrickFrame } from "../../BrickFrame";
import { Card, CardContent, CardHeader } from "../../ui/card";
import { GitHubProfileActivity } from "./GitHubProfileActivity";

/** Fixed light palette so every GitHub brick reads consistently for now. */
const profileCardShellClass =
  "h-full min-h-0 w-full gap-1 overflow-hidden border-0 bg-white py-3 text-zinc-900";
const profileMutedClass = "text-zinc-500";

export function GitHubProfileSquareLg(props: {
  breakpoint: "xs" | "sm" | "lg" | "xl";
  data: {
    login: string;
    avatar_url: string;
    name: string | null;
    bio: string | null;
    location: string | null;
    blog: string;
    public_repos: number;
    followers: number;
    following: number;
    contributions: Array<{
      date: string;
      count: number;
      level: 0 | 1 | 2 | 3 | 4;
    }>;
  };
}) {
  const user = props.data;
  const [avatarFailed, setAvatarFailed] = useState(false);

  const avatarFallback = user.login.slice(0, 2).toUpperCase();
  const avatarSrc = typeof user.avatar_url === "string" ? user.avatar_url : "";

  return (
    <BrickFrame backgroundClassName="bg-white" textClassName="text-zinc-950">
      <Card className={`${profileCardShellClass} rounded-none shadow-none`}>
        <CardHeader className="shrink-0 px-4 pb-0 pt-0">
          <div className="flex flex-col items-start gap-1">
            {avatarFailed || !avatarSrc ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-medium text-zinc-900">
                {avatarFallback}
              </div>
            ) : (
              <Image
                src={avatarSrc}
                alt={user.login}
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 rounded-full object-cover"
                onError={() => setAvatarFailed(true)}
              />
            )}

            <div className="min-w-0 w-full">
              <p className={`${profileMutedClass} `}>@{user.login}</p>
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
              <div
                className="flex min-w-0 items-center gap-1"
                title="Followers"
                aria-label={`${user.followers} followers`}
              >
                <Users className={`h-4 w-4 shrink-0 ${profileMutedClass}`} aria-hidden="true" />
                <span className={`font-medium ${profileMutedClass} `}>{user.followers}</span>
              </div>
              <div
                className="flex min-w-0 items-center gap-1"
                title="Following"
                aria-label={`${user.following} following`}
              >
                <UserPlus className={`h-4 w-4 shrink-0 ${profileMutedClass}`} aria-hidden="true" />
                <span className={`font-medium ${profileMutedClass} `}>{user.following}</span>
              </div>
              <div
                className="flex min-w-0 items-center gap-1"
                title="Repositories"
                aria-label={`${user.public_repos} repositories`}
              >
                <BookOpen className={`h-4 w-4 shrink-0 ${profileMutedClass}`} aria-hidden="true" />
                <span className={`font-medium ${profileMutedClass} `}>{user.public_repos}</span>
              </div>
            </div>
          </div>

          <div className="mt-auto">
            <GitHubProfileActivity contributions={user.contributions} />
          </div>
        </CardContent>
      </Card>
    </BrickFrame>
  );
}
