import type { ComponentProps } from "react";
import Link from "next/link";
import { cn } from "cn";

export function UnderlinedLink(
  props: ComponentProps<typeof Link> & { size?: "lg" | "sm"; variant?: "default" | "accent" },
) {
  const { className, size = "sm", variant = "default", ...linkProps } = props;

  return (
    <Link
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
