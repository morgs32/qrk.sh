"use client";

import * as React from "react";
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

import { cn } from "cn";

function Separator(
  props: React.ComponentProps<typeof SeparatorPrimitive> & { decorative?: boolean },
) {
  const { className, orientation = "horizontal", decorative = true, ...elementProps } = props;
  return (
    <SeparatorPrimitive
      data-slot="separator"
      role={decorative ? "none" : "separator"}
      orientation={orientation}
      className={(state) =>
        cn(
          "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...elementProps}
    />
  );
}

export { Separator };
