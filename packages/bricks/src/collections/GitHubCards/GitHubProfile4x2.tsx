import { BrickFrame } from "../../BrickFrame";
import { GitHubProfileActivity } from "./GitHubProfileActivity";

export function GitHubProfile4x2(_props: {
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
      <div className="flex h-full w-full items-center justify-center px-4 py-3">
        <GitHubProfileActivity />
      </div>
    </BrickFrame>
  );
}
