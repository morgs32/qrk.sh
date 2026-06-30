import { BrickFrame } from "../../BrickFrame";
import { GitHubProfileCard } from "./GitHubProfileCard";

export function GitHubProfile4x4() {
  return (
    <BrickFrame backgroundClassName="bg-[#0d1117]" textClassName="text-[#c9d1d9]">
      <div className="flex h-full w-full min-h-0 items-stretch justify-stretch">
        <GitHubProfileCard />
      </div>
    </BrickFrame>
  );
}
