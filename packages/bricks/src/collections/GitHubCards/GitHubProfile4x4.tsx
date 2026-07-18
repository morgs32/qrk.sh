import { BrickFrame } from "../../BrickFrame";
import { GitHubProfileCard } from "./GitHubProfileCard";

export function GitHubProfile4x4(props: {
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
  return (
    <BrickFrame backgroundClassName="bg-white" textClassName="text-zinc-950">
      <div className="flex h-full w-full min-h-0 items-stretch justify-stretch">
        <GitHubProfileCard data={props.data} />
      </div>
    </BrickFrame>
  );
}
