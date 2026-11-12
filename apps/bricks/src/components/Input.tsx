import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "cn";

function Input(props: React.ComponentProps<"input"> & { variant?: "default" | "sm" }) {
  const { className, type, variant = "default", ...inputProps } = props;
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "flex w-full min-w-0 rounded-(--radius-form-input) border-0 bg-form-input px-2 py-0 text-xs leading-4 text-neutral-950 outline-none transition-[color,box-shadow] placeholder:text-neutral-500 selection:bg-primary selection:text-primary-foreground",
        "file:mr-2 file:inline-flex file:h-full file:items-center file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-neutral-950 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        variant === "sm" ? "h-(--spacing-form-input)" : "h-(--spacing-form-input-default)",
        className,
      )}
      {...inputProps}
      autoComplete="off"
      data-1p-ignore="true"
    />
  );
}

export { Input };
