import { Skeleton } from "../components/ui/skeleton";

export function ArticlePlaceholder() {
  return (
    <div
      aria-hidden="true"
      data-article-placeholder
      className="flex min-h-48 w-full flex-col gap-4 bg-white p-6"
    >
      <Skeleton className="h-8 w-3/4 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-1/2 motion-reduce:animate-none" />
      <Skeleton className="mt-4 h-4 w-full motion-reduce:animate-none" />
      <Skeleton className="h-4 w-full motion-reduce:animate-none" />
      <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
    </div>
  );
}
