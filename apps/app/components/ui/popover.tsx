"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "cn";

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const { children, ...rootProps } = props;
  return <PopoverPrimitive.Root {...rootProps}>{children}</PopoverPrimitive.Root>;
}

function PopoverTrigger(props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  const { children, ...triggerProps } = props;
  return (
    <PopoverPrimitive.Trigger data-slot="popover-trigger" {...triggerProps}>
      {children}
    </PopoverPrimitive.Trigger>
  );
}

function PopoverContent(
  props: React.ComponentProps<typeof PopoverPrimitive.Popup> &
    Pick<PopoverPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">,
) {
  const { className, align = "center", alignOffset, side, sideOffset = 4, ...popupProps } = props;
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={(state) =>
            cn(
              "bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 w-72 origin-(--transform-origin) rounded-md border p-4 shadow-md outline-hidden",
              typeof className === "function" ? className(state) : className,
            )
          }
          {...popupProps}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
