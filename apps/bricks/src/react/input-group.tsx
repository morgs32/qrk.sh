import { cn } from "cn";
import type { ComponentProps } from "react";

import { Button } from "./button";
import { Input } from "./Input";

// Adapted from shadcn's Base UI Input Group for the compact Brick controls.
export const inputGroupClassName =
  "flex h-(--spacing-form-input) w-full min-w-0 items-center rounded-(--radius-form-input) bg-form-input has-[[data-slot=input-group-control]:focus-visible]:ring-[3px] has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[data-slot=input-group-control][aria-invalid=true]]:ring-[3px] has-[[data-slot=input-group-control][aria-invalid=true]]:ring-destructive/20 dark:has-[[data-slot=input-group-control][aria-invalid=true]]:ring-destructive/40";

export function InputGroup(props: ComponentProps<"div">) {
  const { className, ...groupProps } = props;
  return (
    <div
      role="group"
      data-slot="input-group"
      className={cn(inputGroupClassName, className)}
      {...groupProps}
    />
  );
}

export function InputGroupInput(props: ComponentProps<typeof Input>) {
  const { className, ...inputProps } = props;
  return (
    <Input
      {...inputProps}
      data-slot="input-group-control"
      className={cn(
        "flex-1 rounded-none bg-transparent focus-visible:ring-0 aria-invalid:ring-0",
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

export function InputGroupButton(props: ComponentProps<typeof Button>) {
  const { className, type = "button", variant = "ghost", size = "icon", ...buttonProps } = props;
  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      className={cn("size-6 shrink-0 rounded-md", className)}
      {...buttonProps}
    />
  );
}
