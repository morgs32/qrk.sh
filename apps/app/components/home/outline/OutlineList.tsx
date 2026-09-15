import { useContext } from "react";
import type { ReactNode } from "react";
import { OutlineDepth } from "./OutlineDepth";

export function OutlineList({
  children,
  scrollable = false,
  start = 1,
  padded = true,
  spaced = false,
}: {
  children: ReactNode;
  scrollable?: boolean;
  start?: number;
  padded?: boolean;
  spaced?: boolean;
}) {
  const depth = useContext(OutlineDepth);
  const marker =
    depth === 0
      ? "[--outline-style:decimal] [--outline-marker-width:24px]"
      : depth === 1
        ? "[--outline-style:upper-alpha] [--outline-marker-width:24px]"
        : "[--outline-style:lower-roman] [--outline-marker-width:36px]";

  return (
    <OutlineDepth value={depth + 1}>
      <ol
        start={start}
        style={{ counterReset: `outline-item ${start - 1}` }}
        type={depth === 0 ? "1" : depth === 1 ? "A" : "i"}
        className={`list-none px-0 ${padded ? "py-2" : "py-0"} ${spaced ? "flex flex-col gap-2" : ""} ${marker} m-0 ${scrollable ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : ""}`}
      >
        {children}
      </ol>
    </OutlineDepth>
  );
}
