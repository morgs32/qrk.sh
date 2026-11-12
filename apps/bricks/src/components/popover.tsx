import { Popover } from "@base-ui/react/popover";
import { cn } from "cn";
import type { ComponentProps } from "react";

// shadcn's Portal, Positioner, and Popup composition with the Studio editor surface.
export function PopoverContent(props: ComponentProps<typeof Popover.Popup>) {
  const { className, ...popupProps } = props;
  return (
    <Popover.Portal>
      <Popover.Positioner
        side="left"
        align="start"
        sideOffset={12}
        collisionPadding={8}
        className="z-50"
      >
        <Popover.Popup
          data-slot="popover-content"
          className={cn(
            "w-64 max-w-[calc(100vw-16px)] rounded-[10px] bg-popover text-xs text-popover-foreground shadow-lg",
            className,
          )}
          {...popupProps}
        />
      </Popover.Positioner>
    </Popover.Portal>
  );
}
