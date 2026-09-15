"use client";

import { Image } from "@unpic/react";
import { useState } from "react";

export function Avatar(props: { avatar_url: string; login: string }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarFallback = props.login.slice(0, 2).toUpperCase();
  const avatarSrc = typeof props.avatar_url === "string" ? props.avatar_url : "";

  if (avatarFailed || !avatarSrc) {
    return (
      <div
        data-github-profile-json-render="Avatar"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-900"
      >
        {avatarFallback}
      </div>
    );
  }

  return (
    <Image
      data-github-profile-json-render="Avatar"
      src={avatarSrc}
      alt={props.login}
      width={32}
      height={32}
      className="h-8 w-8 shrink-0 rounded-full object-cover"
      onError={() => setAvatarFailed(true)}
    />
  );
}
