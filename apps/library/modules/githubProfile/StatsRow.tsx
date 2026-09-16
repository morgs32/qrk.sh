import { BookOpen, UserPlus, Users } from "lucide-react";

import { brickMetaIconClass, brickMutedClass } from "../../components/brick/brickTokens";

export function StatsRow(props: { public_repos: number; followers: number; following: number }) {
  return (
    <div data-github-profile-json-render="StatsRow" className={`flex gap-4 ${brickMutedClass}`}>
      <div
        className="flex min-w-0 items-center gap-1"
        title="Followers"
        aria-label={`${props.followers} followers`}
      >
        <Users className={brickMetaIconClass} aria-hidden="true" />
        <span className="truncate font-medium">{props.followers}</span>
      </div>
      <div
        className="flex min-w-0 items-center gap-1"
        title="Following"
        aria-label={`${props.following} following`}
      >
        <UserPlus className={brickMetaIconClass} aria-hidden="true" />
        <span className="truncate font-medium">{props.following}</span>
      </div>
      <div
        className="flex min-w-0 items-center gap-1"
        title="Repositories"
        aria-label={`${props.public_repos} repositories`}
      >
        <BookOpen className={brickMetaIconClass} aria-hidden="true" />
        <span className="truncate font-medium">{props.public_repos}</span>
      </div>
    </div>
  );
}
