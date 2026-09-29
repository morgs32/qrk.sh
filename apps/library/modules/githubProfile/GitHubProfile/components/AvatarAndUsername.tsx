"use client";

import { Image } from "@unpic/react";
import { useState } from "react";
import { makeComponentView } from "../../../../make/makeComponentView";
import { avatarAndUsernameComponent } from "../../generator/AvatarAndUsernameComponent";

export const avatarAndUsernameView = makeComponentView(avatarAndUsernameComponent, {
  component(props) {
    const { login, avatar_url } = props;
    const [avatarFailed, setAvatarFailed] = useState(false);
    const avatarFallback = login.slice(0, 2).toUpperCase();
    const avatarSrc = typeof avatar_url === "string" ? avatar_url : "";

    return (
      <div
        data-github-profile-json-render="AvatarAndUsername"
        className="flex min-w-0 shrink-0 items-center gap-2"
      >
        {avatarFailed || !avatarSrc ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 font-medium">
            {avatarFallback}
          </div>
        ) : (
          <Image
            src={avatarSrc}
            alt={login}
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-full object-cover"
            onError={() => setAvatarFailed(true)}
          />
        )}
        <p className="min-w-0 truncate">@{login}</p>
      </div>
    );
  },
});
