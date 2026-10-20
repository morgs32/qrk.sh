import { Skeleton } from "../../components/ui/skeleton";

export function SwatchAndIconPlaceholder() {
  return (
    <div
      aria-hidden="true"
      data-swatch-and-icon-placeholder
      className="flex min-h-24 w-full items-center justify-center bg-zinc-100 p-4"
    >
      <Skeleton className="size-10 rounded-full motion-reduce:animate-none" />
    </div>
  );
}
