"use client";

import { Image } from "@unpic/react";
import { useState } from "react";
import { BookOpen, Link as LinkIcon, MapPin, Quote, UserPlus, Users } from "lucide-react";

import { BrickFrame } from "../../../../BrickFrame";
import { Card, CardContent, CardHeader } from "../../../../components/ui/card";

/** Fixed light palette so every GitHub brick reads consistently for now. */
const profileCardShellClass =
  "h-full min-h-0 w-full gap-1 overflow-hidden border-0 bg-white p-2 text-xs text-zinc-900";
const profileMutedClass = "text-zinc-500";

export function GitHubProfileSquareXs(props: {
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
        <CardHeader className="shrink-0 p-0">
          <div className="flex flex-col items-start gap-1">
            {avatarFailed || !avatarSrc ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-900">
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
              <p className={`${profileMutedClass} truncate`}>@{user.login}</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto p-0">
          <div className={`flex flex-1 flex-col gap-2 text-xs ${profileMutedClass}`}>
            {user.bio && (
              <div className="flex items-center gap-1">
                <Quote className="size-3.5 shrink-0" />
                <span className="truncate">{user.bio}</span>
              </div>
            )}
            {user.location && (
              <div className="flex items-center gap-1">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{user.location}</span>
              </div>
            )}
            {user.blog && (
              <a
                href={user.blog.startsWith("http") ? user.blog : `https://${user.blog}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 cursor-pointer transition-colors hover:text-blue-600"
              >
                <LinkIcon className="size-3.5 shrink-0" />
                <span className="truncate">{user.blog.replace(/^https?:\/\//, "")}</span>
              </a>
            )}
            <div className="mt-auto flex gap-4 text-xs">
              <div
                className="flex min-w-0 items-center gap-1"
                title="Followers"
                aria-label={`${user.followers} followers`}
              >
                <Users className={`size-3.5 shrink-0 ${profileMutedClass}`} aria-hidden="true" />
                <span className={`font-medium ${profileMutedClass} truncate`}>
                  {user.followers}
                </span>
              </div>
              <div
                className="flex min-w-0 items-center gap-1"
                title="Following"
                aria-label={`${user.following} following`}
              >
                <UserPlus className={`size-3.5 shrink-0 ${profileMutedClass}`} aria-hidden="true" />
                <span className={`font-medium ${profileMutedClass} truncate`}>
                  {user.following}
                </span>
              </div>
              <div
                className="flex min-w-0 items-center gap-1"
                title="Repositories"
                aria-label={`${user.public_repos} repositories`}
              >
                <BookOpen className={`size-3.5 shrink-0 ${profileMutedClass}`} aria-hidden="true" />
                <span className={`font-medium ${profileMutedClass} truncate`}>
                  {user.public_repos}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </BrickFrame>
  );
}
