import { TileFrame } from "../../TileFrame";
import { GitHubProfileCard } from "./GitHubProfileCard";

export function GitHubProfile4x4() {
  return (
    <TileFrame backgroundClassName="bg-background" textClassName="text-foreground">
      <div className="flex h-full w-full min-h-0 items-stretch justify-stretch">
        <GitHubProfileCard />
      </div>
    </TileFrame>
  );
}
