import { BrickFrame } from "../../BrickFrame";
import { GitHubLanguagesCard } from "./GitHubLanguagesCard";

export function GitHubLanguages2x2() {
  return (
    <BrickFrame backgroundClassName="bg-card" textClassName="text-card-foreground">
      <div className="flex h-full w-full min-h-0 items-stretch justify-stretch">
        <GitHubLanguagesCard />
      </div>
    </BrickFrame>
  );
}
