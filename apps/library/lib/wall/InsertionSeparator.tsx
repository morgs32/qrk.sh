import { Plus } from "lucide-react";
import { Button } from "../../components/ui/button";
import type { wallInsertionTargetSchema } from "./wallInsertionTargetSchema";

/** Overlay a real insertion target without reserving space between adjacent content. */
export function InsertionSeparator(props: {
  label: string;
  target: typeof wallInsertionTargetSchema.Type;
  orientation?: "horizontal" | "vertical";
  onAdd: (target: typeof wallInsertionTargetSchema.Type) => void;
}) {
  const { label, target, orientation = "horizontal", onAdd } = props;
  return (
    <div
      className={
        orientation === "vertical" ? "relative w-0 shrink-0 self-stretch" : "relative h-0 w-full"
      }
    >
      <Button
        type="button"
        variant="ghost"
        aria-label={label}
        data-wall-insertion={JSON.stringify(target)}
        className={`group/insertion absolute z-10 shrink-0 gap-0 rounded-none p-0 text-blue-600 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 data-[drop-active=true]:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100 ${orientation === "vertical" ? "inset-y-0 -left-1.5 h-full min-h-8 w-3" : "-top-2 left-0 h-4 w-full"}`}
        onClick={() => onAdd(target)}
      >
        <span
          aria-hidden="true"
          className={`absolute bg-current group-data-[drop-active=true]/insertion:shadow-[0_0_0_1px_currentColor] ${orientation === "vertical" ? "inset-y-0 left-1/2 w-px" : "inset-x-0 top-1/2 h-px"}`}
        />
        <span className="relative flex size-4 items-center justify-center border border-current bg-background">
          <Plus className="size-3" aria-hidden="true" />
        </span>
      </Button>
    </div>
  );
}
