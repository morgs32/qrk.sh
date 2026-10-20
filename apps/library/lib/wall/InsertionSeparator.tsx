import type { wallInsertionTargetSchema } from "./wallInsertionTargetSchema";

/** Show a drop boundary during dragging without a button or reserved layout space. */
export function InsertionSeparator(props: {
  label: string;
  target: typeof wallInsertionTargetSchema.Type;
  orientation?: "horizontal" | "vertical";
}) {
  const { label, target, orientation = "horizontal" } = props;
  return (
    <div
      aria-hidden="true"
      className={
        orientation === "vertical" ? "relative w-0 shrink-0 self-stretch" : "relative h-0 w-full"
      }
    >
      <div
        aria-label={label}
        data-wall-insertion={JSON.stringify(target)}
        className={`pointer-events-none absolute z-10 text-blue-600 opacity-0 transition-opacity data-[drop-active=true]:opacity-100 motion-reduce:transition-none ${target.kind === "wall" ? "" : "group-data-[dragging=true]/wall:pointer-events-auto"} ${orientation === "vertical" ? "inset-y-0 -left-1.5 h-full min-h-8 w-3" : "-top-2 left-0 h-4 w-full"}`}
      >
        {target.kind === "wall" ? (
          <span className="pointer-events-none absolute inset-y-0 left-0 w-3 group-data-[dragging=true]/wall:pointer-events-auto" />
        ) : null}
        <span
          aria-hidden="true"
          className={`absolute bg-current ${orientation === "vertical" ? "inset-y-0 left-1/2 w-px" : "inset-x-0 top-1/2 h-px"}`}
        />
      </div>
    </div>
  );
}
