import { BrickFrame } from "../../BrickFrame";
import { GitHubAchievementsCard } from "./GitHubAchievementsCard";

export function GitHubAchievements4x2() {
  return (
    <BrickFrame backgroundClassName="bg-white" textClassName="text-zinc-950">
      <div className="flex h-full w-full min-h-0 items-stretch justify-stretch">
        <GitHubAchievementsCard />
      </div>
    </BrickFrame>
  );
}
