import type { ReactNode } from "react";

export function BrickFrame({ children }: { children?: ReactNode }) {
  return (
    <div className="qrk-bricks typeset typeset-brick flex h-full w-full overflow-hidden bg-white [&_svg]:select-none">
      {children}
    </div>
  );
}
