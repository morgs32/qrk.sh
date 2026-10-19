import type { ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "cn";

export function UnderlinedLink(
  props: ComponentProps<"a"> & {
    asChild?: boolean;
    size?: "lg" | "sm";
    variant?: "default" | "accent";
  },
) {
  const { asChild = false, className, size = "sm", variant = "default", ...linkProps } = props;
  const Comp = asChild ? Slot : "a";

  return (
    <Comp
      {...linkProps}
      className={cn(
        variant === "accent"
          ? "text-[#E86F3A] underline underline-offset-4"
          : "underline underline-offset-4",
        size === "lg" ? "text-base" : "text-xs",
        className,
      )}
    />
  );
}
