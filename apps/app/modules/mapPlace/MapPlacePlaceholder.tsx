import { Skeleton } from "../components/ui/skeleton";

export function MapPlacePlaceholder() {
  return (
    <div
      aria-hidden="true"
      data-map-place-placeholder
      className="relative min-h-52 w-full overflow-hidden bg-white p-4"
    >
      <Skeleton className="absolute inset-0 rounded-none motion-reduce:animate-none" />
      <div className="relative flex h-44 items-center justify-center">
        <span className="size-6 rounded-full border-4 border-white bg-zinc-300" />
      </div>
    </div>
  );
}
