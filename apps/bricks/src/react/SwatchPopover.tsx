import { Popover } from "@base-ui/react/popover";
import { useId, type ReactNode } from "react";

import { Button } from "./button";

export function SwatchPopover(props: { label: string; color: string; children: ReactNode }) {
  const { label, color, children } = props;
  const id = useId();

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Pick ${label.toLowerCase()} color`}
            className="mr-0.5 size-6 shrink-0 rounded-md hover:bg-neutral-200"
          >
            <span
              aria-hidden="true"
              className="size-3 rounded-[2px] bg-white"
              style={{ backgroundColor: color }}
            />
          </Button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          side="left"
          align="start"
          sideOffset={12}
          collisionPadding={8}
          className="z-50"
        >
          <Popover.Popup
            aria-labelledby={id}
            className="qrk-bricks w-64 max-w-[calc(100vw-16px)] rounded-[10px] bg-white text-xs text-neutral-950 shadow-lg"
          >
            <h2 id={id} className="px-4 py-3 leading-5 font-semibold">
              {label}
            </h2>
            <hr className="border-neutral-200" />
            <div className="grid gap-3 p-4">{children}</div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
