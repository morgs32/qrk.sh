import { BrickFrame } from "../../BrickFrame";
import { GitHubLanguagesCard } from "./GitHubLanguagesCard";

export function GitHubLanguagesChart() {
  return (
    <BrickFrame backgroundClassName="bg-white" textClassName="text-zinc-950">
      <div className="flex h-full w-full min-h-0 items-stretch justify-stretch">
        <GitHubLanguagesCard />
      </div>
    </BrickFrame>
  );
}
