import { cn } from "cn";
import type { ComponentProps } from "react";

import { Label } from "./label";

// shadcn Field layout and feedback parts.
export function Field(props: ComponentProps<"div"> & { orientation?: "vertical" | "horizontal" }) {
  const { className, orientation = "vertical", ...fieldProps } = props;
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(
        "group/field flex w-full min-w-0 gap-2",
        orientation === "vertical" ? "flex-col" : "items-center",
        className,
      )}
      {...fieldProps}
    />
  );
}

export function FieldLabel(props: ComponentProps<typeof Label>) {
  const { className, ...labelProps } = props;
  return <Label data-slot="field-label" className={cn("font-medium", className)} {...labelProps} />;
}

export function FieldDescription(props: ComponentProps<"p">) {
  const { className, ...descriptionProps } = props;
  return (
    <p
      data-slot="field-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...descriptionProps}
    />
  );
}

export function FieldError(props: ComponentProps<"div">) {
  const { className, ...errorProps } = props;
  return (
    <div
      data-slot="field-error"
      role="alert"
      className={cn("text-sm text-destructive", className)}
      {...errorProps}
    />
  );
}
