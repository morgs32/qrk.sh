"use client";

import { Avatar, AvatarFallback, AvatarImage } from "../../../../../components/avatar";
import { makeComponentView } from "../../../../react/makeComponentView";
import { avatarAndUsernameComponentMetadata } from "../../../definition/generator/AvatarAndUsernameComponentMetadata";

export const avatarAndUsernameView = makeComponentView(avatarAndUsernameComponentMetadata, {
  component(props) {
    const { login, avatar_url } = props;
    const avatarFallback = login.slice(0, 2).toUpperCase();
    const avatarSrc = typeof avatar_url === "string" ? avatar_url : "";

    return (
      <div
        data-github-profile-json-render="AvatarAndUsername"
        className="flex min-w-0 shrink-0 items-center gap-2"
      >
        <Avatar>
          <AvatarImage src={avatarSrc || undefined} alt={login} />
          <AvatarFallback className="bg-zinc-200 text-current">{avatarFallback}</AvatarFallback>
        </Avatar>
        <p className="min-w-0 truncate">@{login}</p>
      </div>
    );
  },
});
