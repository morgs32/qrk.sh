import { BookOpen, UserPlus, Users } from "lucide-react";
import { GitHubProfileActivity } from "./GitHubProfileActivity";
import { BrickFrame } from "../../BrickFrame";

export function GitHubProfileWideSm(props: {
  breakpoint: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
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
  return (
    <BrickFrame backgroundClassName="bg-white" textClassName="text-zinc-950">
      <div
        data-brick-breakpoint={props.breakpoint}
        className="flex h-full w-full flex-col justify-center gap-3 px-4 py-3"
      >
        {" "}
        <div className="flex w-full items-center justify-between gap-2 text-xs">
          <span className="min-w-0 truncate font-medium">@{props.data.login}</span>
          <div className="flex shrink-0 items-center gap-3">
            <span
              className="flex items-center gap-1"
              title="Followers"
              aria-label={`${props.data.followers} followers`}
            >
              <Users className="size-3.5 text-zinc-500" aria-hidden="true" />
              {props.data.followers}
            </span>
            <span
              className="flex items-center gap-1"
              title="Following"
              aria-label={`${props.data.following} following`}
            >
              <UserPlus className="size-3.5 text-zinc-500" aria-hidden="true" />
              {props.data.following}
            </span>
            <span
              className="flex items-center gap-1"
              title="Repositories"
              aria-label={`${props.data.public_repos} repositories`}
            >
              <BookOpen className="size-3.5 text-zinc-500" aria-hidden="true" />
              {props.data.public_repos}
            </span>
          </div>
        </div>
        <GitHubProfileActivity contributions={props.data.contributions} />
      </div>
    </BrickFrame>
  );
}
