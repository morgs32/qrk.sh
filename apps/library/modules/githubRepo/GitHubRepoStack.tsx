import { GitHubRepoCard } from "./GitHubRepoCard";

export function GitHubRepoStack() {
  return (
    <div className="flex h-full w-full min-h-0 items-stretch justify-stretch">
      <GitHubRepoCard size="xs" />
    </div>
  );
}
