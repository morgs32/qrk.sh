import type { ReactNode } from "react";
import { Card } from "../ui/card";

export function BrickViewFrame(props: {
  frame: "default" | "card";
  children: ReactNode;
  controls?: ReactNode;
}) {
  const { frame, children, controls } = props;
  if (frame === "card") {
    return (
      <div className="size-full p-[calc(var(--card-gap,32px)/2)]">
        <Card data-brick-frame="card" className="relative size-full min-h-0 min-w-0 gap-0 p-2">
          <div className="brick-drag-content size-full min-h-0 min-w-0 overflow-hidden">
            {children}
          </div>
          {controls}
        </Card>
      </div>
    );
  }
  return (
    <div data-brick-frame="default" className="relative size-full">
      <div className="brick-drag-content size-full">{children}</div>
      {controls}
    </div>
  );
}
