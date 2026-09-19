import { UserPlus } from "lucide-react";

import { brickMetaIconClass } from "../../../../components/brick/brickTokens";

export function Following(props: { following: number }) {
  return (
    <div
      data-github-profile-json-render="Following"
      className="flex min-w-0 items-center gap-1"
      title="Following"
      aria-label={`${props.following} following`}
    >
      <UserPlus className={brickMetaIconClass} aria-hidden="true" />
      <span className="truncate">{props.following}</span>
    </div>
  );
}
