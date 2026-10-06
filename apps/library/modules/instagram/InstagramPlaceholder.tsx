import { BrickFooter } from "../../components/brick/BrickFooter";
import { BrickShell } from "../../components/brick/BrickShell";
import { Skeleton } from "../../components/ui/skeleton";

export function InstagramPlaceholder() {
  return (
    <BrickShell data-instagram-placeholder aria-hidden="true" className="overflow-hidden bg-white">
      <div className="relative min-h-[200px] min-w-[200px] flex-1 overflow-hidden bg-zinc-200">
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="size-full rounded-none motion-reduce:animate-none" />
          ))}
        </div>
      </div>
      <BrickFooter className="gap-2 overflow-hidden">
        <Skeleton className="size-8 shrink-0 rounded-none motion-reduce:animate-none" />
        <Skeleton className="h-4 min-w-0 flex-1 motion-reduce:animate-none" />
        <Skeleton className="h-4 w-8 shrink-0 motion-reduce:animate-none" />
        <Skeleton className="h-6 w-20 shrink-0 motion-reduce:animate-none" />
      </BrickFooter>
    </BrickShell>
  );
}
