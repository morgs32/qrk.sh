import { TileFrame } from "../../TileFrame";
import { GitHubAchievementsCard } from "./GitHubAchievementsCard";

export function GitHubAchievements4x2() {
  return (
    <TileFrame backgroundClassName="bg-zinc-950" textClassName="text-zinc-100">
      <div className="flex h-full w-full min-h-0 items-stretch justify-stretch">
        <GitHubAchievementsCard />
      </div>
    </TileFrame>
  );
}
