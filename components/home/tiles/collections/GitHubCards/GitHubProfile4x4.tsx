import { TileFrame } from "../../TileFrame";
import { GitHubProfileCard } from "./GitHubProfileCard";

export function GitHubProfile4x4() {
  return (
    <TileFrame backgroundClassName="bg-[#0d1117]" textClassName="text-[#c9d1d9]">
      <div className="flex h-full w-full min-h-0 items-stretch justify-stretch">
        <GitHubProfileCard />
      </div>
    </TileFrame>
  );
}
