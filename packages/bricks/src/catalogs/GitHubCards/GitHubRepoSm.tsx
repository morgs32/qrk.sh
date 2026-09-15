import { BrickFrame } from "../../BrickFrame";
import { GitHubRepoCard } from "./GitHubRepoCard";

export function GitHubRepoSm() {
  return (
    <BrickFrame backgroundClassName="bg-white" textClassName="text-zinc-950">
      <div className="flex h-full w-full min-h-0 items-stretch justify-stretch">
        <GitHubRepoCard />
      </div>
    </BrickFrame>
  );
}
