import type { ComponentProps } from "react";
import Link from "next/link";
import { cn } from "cn";

export function UnderlinedLink(props: ComponentProps<typeof Link> & { size?: "lg" | "sm" }) {
  const { className, size = "sm", ...linkProps } = props;

  return (
    <Link
      {...linkProps}
      className={cn(
        "underline underline-offset-4",
        size === "lg" ? "text-base" : "text-xs",
        className,
      )}
    />
  );
}
