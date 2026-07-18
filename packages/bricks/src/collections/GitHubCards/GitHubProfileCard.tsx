"use client";

import { Image } from "@unpic/react";
import { useState } from "react";
import { BookOpen, Link as LinkIcon, MapPin, Quote, Users } from "lucide-react";

import { Card, CardContent, CardHeader } from "../../ui/card";
import { GitHubProfileActivity } from "./GitHubProfileActivity";

/** Fixed light palette so every GitHub brick reads consistently for now. */
const profileCardShellClass =
  "h-full min-h-0 w-full gap-1 overflow-hidden rounded-none border border-zinc-200 bg-white py-3 text-zinc-900 shadow-none";
const profileMutedClass = "text-zinc-500";
const profileHeadingClass = "text-zinc-950";

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

export function GitHubProfileCard(props: {
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
          <GitHubProfileActivity contributions={user.contributions} />
        </div>
      </CardContent>
    </Card>
  );
}
