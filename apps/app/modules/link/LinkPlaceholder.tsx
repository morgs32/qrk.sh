import { Skeleton } from "../components/ui/skeleton";

export function LinkPlaceholder() {
  return (
    <div
      data-link-placeholder
      aria-hidden="true"
      className="flex h-full min-h-0 w-full gap-4 overflow-hidden bg-white"
    >
      <div className="flex min-w-0 w-1/2 shrink-0 flex-col gap-4 overflow-hidden p-4">
        <div className="flex min-w-0 shrink-0 flex-col gap-1">
          <Skeleton className="size-8 shrink-0 rounded-sm motion-reduce:animate-none" />
          <Skeleton className="h-3 w-full motion-reduce:animate-none" />
        </div>
        <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
          <Skeleton className="h-5 w-full shrink-0 motion-reduce:animate-none" />
          <Skeleton className="h-5 w-full shrink-0 motion-reduce:animate-none" />
          <Skeleton className="h-5 w-3/4 shrink-0 motion-reduce:animate-none" />
        </div>
      </div>
      <Skeleton className="h-full min-w-0 flex-1 rounded-none motion-reduce:animate-none" />
    </div>
  );
}
