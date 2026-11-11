"use client";

import { isValidElement, type ComponentProps } from "react";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";

export function UnderlinedLink(
  props: ComponentProps<"a"> & {
    asChild?: boolean;
    size?: "lg" | "sm";
    variant?: "default" | "accent";
  },
) {
  const {
    asChild = false,
    className,
    size = "sm",
    variant = "default",
    children,
    ...linkProps
  } = props;
  const render = asChild && isValidElement(children) ? children : undefined;
  return useRender({
    defaultTagName: "a",
    render,
    props: {
      ...linkProps,
      className: cn(
        variant === "accent"
          ? "text-[#E86F3A] underline underline-offset-4"
          : "underline underline-offset-4",
        size === "lg" ? "text-base" : "text-xs",
        className,
      ),
      ...(render === undefined && { children }),
    },
  });
}
