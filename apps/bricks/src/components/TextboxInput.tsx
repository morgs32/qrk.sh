import type { ComponentProps } from "react";
import { cn } from "cn";

export function TextboxInput(props: ComponentProps<"textarea">) {
  const { className, ...textareaProps } = props;
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "block min-h-16 w-full min-w-0 field-sizing-content rounded-(--radius-form-input) border-0 bg-form-input px-2 py-1.5 text-xs leading-4 text-neutral-950 outline-none transition-[color,box-shadow] placeholder:text-neutral-500 selection:bg-primary selection:text-primary-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...textareaProps}
      autoComplete="off"
      data-1p-ignore="true"
    />
  );
}
