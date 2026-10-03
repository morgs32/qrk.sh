import { BrickBody } from "../../components/brick/BrickBody";
import { BrickFooter } from "../../components/brick/BrickFooter";
import { BrickShell } from "../../components/brick/BrickShell";
import { Skeleton } from "../../components/ui/skeleton";

export function GitHubProfilePlaceholder() {
  return (
    <BrickShell
      data-github-profile-placeholder
      aria-hidden="true"
      className="overflow-hidden bg-white"
    >
      <BrickBody className="overflow-hidden">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <Skeleton className="size-8 shrink-0 rounded-full motion-reduce:animate-none" />
          <Skeleton className="h-4 w-28 max-w-full motion-reduce:animate-none" />
        </div>
        <Skeleton className="h-4 w-full shrink-0 motion-reduce:animate-none" />
        <Skeleton className="h-4 w-3/4 shrink-0 motion-reduce:animate-none" />
        <Skeleton className="h-4 w-1/2 shrink-0 motion-reduce:animate-none" />
      </BrickBody>
      <BrickFooter>
        <div className="flex min-w-0 w-full justify-end gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-4 w-8 motion-reduce:animate-none" />
          ))}
        </div>
      </BrickFooter>
    </BrickShell>
  );
}
