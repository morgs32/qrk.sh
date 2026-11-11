import type { ComponentProps } from "react";
import { cn } from "cn";

// Adapted from shadcn/ui's Base UI Field registry for Brick sidebar rows.
export function FieldGroup(props: ComponentProps<"div">) {
  const { className, ...groupProps } = props;
  return (
    <div
      data-slot="field-group"
      className={cn(
        "group/field-group @container/field-group flex w-full min-w-0 flex-col gap-3",
        className,
      )}
      {...groupProps}
    />
  );
}

export function Field(props: ComponentProps<"div"> & { orientation?: "vertical" | "horizontal" }) {
  const { className, orientation = "vertical", ...fieldProps } = props;
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(
        "group/field grid w-full min-w-0 gap-1",
        orientation === "horizontal" && "grid-cols-[76px_minmax(0,1fr)] items-start",
        className,
      )}
      {...fieldProps}
    />
  );
}

export function FieldLabel(props: ComponentProps<"label">) {
  const { className, ...labelProps } = props;
  return (
    <label
      data-slot="field-label"
      className={cn(
        "flex min-h-7 min-w-0 select-none items-center text-xs leading-none font-medium text-muted-foreground group-focus-within/field:text-primary",
        className,
      )}
      {...labelProps}
    />
  );
}

export function FieldContent(props: ComponentProps<"div">) {
  const { className, ...contentProps } = props;
  return (
    <div
      data-slot="field-content"
      className={cn("flex min-w-0 flex-col gap-1", className)}
      {...contentProps}
    />
  );
}

export function FieldDescription(props: ComponentProps<"p">) {
  const { className, ...descriptionProps } = props;
  return (
    <p
      data-slot="field-description"
      className={cn("m-0 break-words text-xs leading-normal text-muted-foreground", className)}
      {...descriptionProps}
    />
  );
}

export function FieldError(props: ComponentProps<"div">) {
  const { className, ...errorProps } = props;
  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("break-words text-xs leading-normal text-destructive", className)}
      {...errorProps}
    />
  );
}
