import { Skeleton } from "../../components/ui/skeleton";

export function ImagePlaceholder() {
  return (
    <div
      aria-hidden="true"
      data-image-placeholder
      className="flex min-h-48 w-full flex-col bg-white"
    >
      <Skeleton className="aspect-[4/3] w-full rounded-none motion-reduce:animate-none" />
      <div className="p-4">
        <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
      </div>
    </div>
  );
}
