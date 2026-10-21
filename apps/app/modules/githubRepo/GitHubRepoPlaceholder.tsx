import { BrickBody } from "../components/brick/BrickBody";
import { BrickFooter } from "../components/brick/BrickFooter";
import { BrickShell } from "../components/brick/BrickShell";
import { Skeleton } from "../components/ui/skeleton";

export function GitHubRepoPlaceholder() {
  return (
    <BrickShell
      data-github-repo-placeholder
      aria-hidden="true"
      className="overflow-hidden bg-white"
    >
      <BrickBody className="overflow-hidden">
        <Skeleton className="h-5 w-2/3 shrink-0 motion-reduce:animate-none" />
        <Skeleton className="h-4 w-full shrink-0 motion-reduce:animate-none" />
        <Skeleton className="h-4 w-3/4 shrink-0 motion-reduce:animate-none" />
      </BrickBody>
      <BrickFooter>
        <div className="flex min-w-0 w-full items-center gap-4">
          <Skeleton className="h-4 w-8 motion-reduce:animate-none" />
          <Skeleton className="h-4 w-8 motion-reduce:animate-none" />
          <Skeleton className="h-4 w-20 motion-reduce:animate-none" />
        </div>
      </BrickFooter>
    </BrickShell>
  );
}
