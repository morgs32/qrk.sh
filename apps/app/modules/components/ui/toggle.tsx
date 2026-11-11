"use client";

import * as React from "react";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "cn";

const toggleVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-pressed:bg-accent data-pressed:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 min-w-9 px-2",
        sm: "h-8 min-w-8 px-1.5",
        lg: "h-10 min-w-10 px-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle(
  props: React.ComponentPropsWithoutRef<typeof TogglePrimitive> &
    VariantProps<typeof toggleVariants>,
) {
  const { className, variant, size, ...elementProps } = props;
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={(state) =>
        cn(
          toggleVariants({
            variant,
            size,
            className: typeof className === "function" ? className(state) : className,
          }),
        )
      }
      {...elementProps}
    />
  );
}

export { Toggle, toggleVariants };
