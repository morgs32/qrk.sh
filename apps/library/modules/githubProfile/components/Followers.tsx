import { Users } from "lucide-react";

import { brickMetaIconClass } from "../../../components/brick/brickTokens";

export function Followers(props: { followers: number }) {
  return (
    <div
      data-github-profile-json-render="Followers"
      className="flex min-w-0 items-center gap-1"
      title="Followers"
      aria-label={`${props.followers} followers`}
    >
      <Users className={brickMetaIconClass} aria-hidden="true" />
      <span className="truncate">{props.followers}</span>
    </div>
  );
}
