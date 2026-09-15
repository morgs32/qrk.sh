import { BookOpen, UserPlus, Users } from "lucide-react";

export function StatsRow(props: {
  public_repos: number;
  followers: number;
  following: number;
}) {
  return (
    <div
      data-github-profile-json-render="StatsRow"
      className="flex gap-4 text-xs text-zinc-500"
    >
      <div
        className="flex min-w-0 items-center gap-1"
        title="Followers"
        aria-label={`${props.followers} followers`}
      >
        <Users className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate font-medium">{props.followers}</span>
      </div>
      <div
        className="flex min-w-0 items-center gap-1"
        title="Following"
        aria-label={`${props.following} following`}
      >
        <UserPlus className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate font-medium">{props.following}</span>
      </div>
      <div
        className="flex min-w-0 items-center gap-1"
        title="Repositories"
        aria-label={`${props.public_repos} repositories`}
      >
        <BookOpen className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate font-medium">{props.public_repos}</span>
      </div>
    </div>
  );
}
