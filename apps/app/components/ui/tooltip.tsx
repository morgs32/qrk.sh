"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "cn";

function TooltipProvider(props: TooltipPrimitive.Provider.Props) {
  const { delay = 0, ...providerProps } = props;
  return <TooltipPrimitive.Provider delay={delay} {...providerProps} />;
}

function Tooltip(props: TooltipPrimitive.Root.Props) {
  const { children, ...rootProps } = props;
  return <TooltipPrimitive.Root {...rootProps}>{children}</TooltipPrimitive.Root>;
}

function TooltipTrigger(props: TooltipPrimitive.Trigger.Props) {
  const { children, ...triggerProps } = props;
  return (
    <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...triggerProps}>
      {children}
    </TooltipPrimitive.Trigger>
  );
}

function TooltipContent(
  props: React.ComponentProps<typeof TooltipPrimitive.Popup> &
    Pick<TooltipPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">,
) {
  const { className, align, alignOffset, side, sideOffset = 0, children, ...popupProps } = props;
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={(state) =>
            cn(
              "w-fit origin-(--transform-origin) rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
              typeof className === "function" ? className(state) : className,
            )
          }
          {...popupProps}
        >
          {children}
          <TooltipPrimitive.Arrow className="size-2.5 rotate-45 rounded-[2px] bg-foreground data-[side=bottom]:-top-1 data-[side=left]:-right-1 data-[side=right]:-left-1 data-[side=top]:-bottom-1" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
