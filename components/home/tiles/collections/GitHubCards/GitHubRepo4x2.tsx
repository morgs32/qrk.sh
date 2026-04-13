import { TileFrame } from "../../TileFrame";
import { GitHubRepoCard } from "./GitHubRepoCard";

export function GitHubRepo4x2() {
  return (
    <TileFrame backgroundClassName="bg-zinc-900" textClassName="text-zinc-100">
      <div className="flex h-full w-full min-h-0 items-stretch justify-stretch">
        <GitHubRepoCard />
      </div>
    </TileFrame>
  );
}
