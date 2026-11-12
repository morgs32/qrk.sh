import { cn } from "cn";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { Button } from "./button";
import { Input } from "./Input";

// Adapted from shadcn's Base UI Input Group for Bricks fields.
const inputGroupClassName =
  "flex w-full min-w-0 items-center rounded-(--radius-form-input) bg-form-input has-[[data-slot=input-group-control]:focus-visible]:ring-[3px] has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[data-slot=input-group-control][aria-invalid=true]]:ring-[3px] has-[[data-slot=input-group-control][aria-invalid=true]]:ring-destructive/20 dark:has-[[data-slot=input-group-control][aria-invalid=true]]:ring-destructive/40";

export function InputGroup(props: ComponentProps<"div"> & { variant?: "default" | "sm" }) {
  const { className, variant = "default", ...groupProps } = props;
  return (
    <div
      role="group"
      data-slot="input-group"
      className={cn(
        inputGroupClassName,
        variant === "sm" ? "h-(--spacing-form-input)" : "h-(--spacing-form-input-default)",
        className,
      )}
      {...groupProps}
    />
  );
}

export function InputGroupInput(props: Omit<ComponentProps<typeof Input>, "variant">) {
  const { className, ...inputProps } = props;
  return (
    <Input
      {...inputProps}
      data-slot="input-group-control"
      className={cn(
        "h-full flex-1 rounded-none bg-transparent focus-visible:ring-0 aria-invalid:ring-0",
        className,
      )}
    />
  );
}

export function InputGroupAddon(
  props: ComponentProps<"div"> & { align?: "inline-start" | "inline-end" },
) {
  const { align = "inline-start", className, ...addonProps } = props;
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        "flex h-full shrink-0 cursor-text items-center text-xs text-muted-foreground",
        align === "inline-start" ? "order-first ps-2" : "order-last pe-0.5",
        className,
      )}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button")) return;
        event.currentTarget.parentElement?.querySelector("input")?.focus();
      }}
      {...addonProps}
    />
  );
}

const inputGroupButtonVariants = cva("flex items-center gap-2 text-sm shadow-none", {
  variants: {
    size: {
      xs: "h-6 gap-1 rounded-[calc(var(--radius)-3px)] px-1.5 [&>svg:not([class*='size-'])]:size-3.5",
      sm: "h-8 gap-1.5 px-2.5",
      "icon-xs": "size-6 rounded-[calc(var(--radius)-3px)] p-0 has-[>svg]:p-0",
      "icon-sm": "size-8 p-0 has-[>svg]:p-0",
    },
  },
  defaultVariants: { size: "xs" },
});

export function InputGroupButton(
  props: Omit<ComponentProps<typeof Button>, "size" | "type"> &
    VariantProps<typeof inputGroupButtonVariants> & {
      type?: "button" | "submit" | "reset";
    },
) {
  const { className, type = "button", variant = "ghost", size = "xs", ...buttonProps } = props;
  return (
    <Button
      type={type}
      variant={variant}
      data-size={size}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...buttonProps}
    />
  );
}
