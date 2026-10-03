import { Skeleton } from "../../components/ui/skeleton";

export function GitHubActivityPlaceholder() {
  return (
    <div
      data-github-activity-placeholder
      aria-hidden="true"
      className="flex h-full min-w-0 w-full items-center overflow-hidden bg-white px-3 py-2"
    >
      <div className="flex min-w-0 w-full items-start">
        <div className="relative h-[94px] w-[26px] shrink-0">
          {[30, 52, 74].map((top) => (
            <Skeleton
              key={top}
              className="absolute right-2 h-[9px] w-[18px] rounded-sm motion-reduce:animate-none"
              style={{ top }}
            />
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="w-[581px] [mask-image:linear-gradient(to_right,black_calc(100%_-_20px),transparent)]">
            <div className="mb-[9px] flex h-[10px] justify-between">
              {Array.from({ length: 12 }, (_, month) => (
                <Skeleton
                  key={month}
                  className="h-[10px] w-[18px] rounded-sm motion-reduce:animate-none"
                />
              ))}
            </div>
            <div className="grid grid-flow-col grid-rows-7 gap-[2px]">
              {Array.from({ length: 53 * 7 }, (_, day) => (
                <Skeleton
                  key={day}
                  className="size-[9px] rounded-[2px] motion-reduce:animate-none"
                />
              ))}
            </div>
          </div>
          <Skeleton className="mt-2 h-[10px] w-[92px] rounded-sm motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}
