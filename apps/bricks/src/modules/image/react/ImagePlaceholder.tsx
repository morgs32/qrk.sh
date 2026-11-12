import { Skeleton } from "../../../components/skeleton";

export function ImagePlaceholder(props: { round?: boolean } = {}) {
  const { round = false } = props;
  if (round) {
    return (
      <div aria-hidden="true" data-image-placeholder className="grid min-h-[200px] w-full place-items-center">
        <Skeleton className="size-[200px] max-w-full rounded-full motion-reduce:animate-none" />
      </div>
    );
  }

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
