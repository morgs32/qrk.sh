import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ComponentProps } from "react";

const alertVariants = cva("group/alert relative grid w-full gap-1 rounded-md border p-3 text-sm", {
  variants: {
    variant: {
      default: "border-border bg-background text-foreground",
      destructive: "border-destructive/30 bg-destructive/5 text-destructive",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Alert(props: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  const { className, variant, ...alertProps } = props;
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...alertProps}
    />
  );
}

export function AlertTitle(props: ComponentProps<"div">) {
  const { className, ...titleProps } = props;
  return <div data-slot="alert-title" className={cn("font-medium", className)} {...titleProps} />;
}

export function AlertDescription(props: ComponentProps<"div">) {
  const { className, ...descriptionProps } = props;
  return (
    <div data-slot="alert-description" className={cn("text-sm", className)} {...descriptionProps} />
  );
}
