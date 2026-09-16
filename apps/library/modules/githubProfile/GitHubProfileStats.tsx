"use client";

import { Image } from "@unpic/react";
import { useState } from "react";
import { BookOpen, Link as LinkIcon, MapPin, Quote, UserPlus, Users } from "lucide-react";

import { BrickBody } from "../../components/brick/BrickBody";
import { BrickFooter } from "../../components/brick/BrickFooter";
import { BrickShell } from "../../components/brick/BrickShell";
import { brickMetaIconClass, brickMutedClass } from "../../components/brick/brickTokens";

export function GitHubProfileStats(props: {
  breakpoint: "sm" | "md" | "lg" | "xl";
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
  };
}) {
  const user = props.data;
  const [avatarFailed, setAvatarFailed] = useState(false);

  const avatarFallback = user.login.slice(0, 2).toUpperCase();
  const avatarSrc = typeof user.avatar_url === "string" ? user.avatar_url : "";

  return (
    <BrickShell>
      <div className="flex shrink-0 flex-col items-start gap-1">
        {avatarFailed || !avatarSrc ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 font-medium">
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
          <p className={`${brickMutedClass} truncate`}>@{user.login}</p>
        </div>
      </div>

      <BrickBody className={brickMutedClass}>
        {user.bio && (
          <div className="flex items-center gap-1">
            <Quote className={brickMetaIconClass} />
            <span className="truncate">{user.bio}</span>
          </div>
        )}
        {user.location && (
          <div className="flex items-center gap-1">
            <MapPin className={brickMetaIconClass} />
            <span className="truncate">{user.location}</span>
          </div>
        )}
        {user.blog && (
          <a
            href={user.blog.startsWith("http") ? user.blog : `https://${user.blog}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex cursor-pointer items-center gap-1"
          >
            <LinkIcon className={brickMetaIconClass} />
            <span className="truncate">{user.blog.replace(/^https?:\/\//, "")}</span>
          </a>
        )}
      </BrickBody>

      <BrickFooter className="justify-end gap-4">
        <div
          className="flex min-w-0 items-center gap-1"
          title="Followers"
          aria-label={`${user.followers} followers`}
        >
          <Users className={brickMetaIconClass} aria-hidden="true" />
          <span className="truncate">{user.followers}</span>
        </div>
        <div
          className="flex min-w-0 items-center gap-1"
          title="Following"
          aria-label={`${user.following} following`}
        >
          <UserPlus className={brickMetaIconClass} aria-hidden="true" />
          <span className="truncate">{user.following}</span>
        </div>
        <div
          className="flex min-w-0 items-center gap-1"
          title="Repositories"
          aria-label={`${user.public_repos} repositories`}
        >
          <BookOpen className={brickMetaIconClass} aria-hidden="true" />
          <span className="truncate">{user.public_repos}</span>
        </div>
      </BrickFooter>
    </BrickShell>
  );
}
