"use client";

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { cn } from "cn";

import { Button } from "./button";

// shadcn Base UI Alert Dialog with independent backdrop and popup styling.
export function AlertDialogContent(
  props: Omit<AlertDialogPrimitive.Popup.Props, "className"> & {
    className?: string;
    backdropClassName?: string;
  },
) {
  const { className, backdropClassName, ...popupProps } = props;
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop
        data-slot="alert-dialog-overlay"
        className={cn("fixed inset-0 isolate z-50 bg-black/30", backdropClassName)}
      />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 text-foreground shadow-xl outline-none",
          className,
        )}
        {...popupProps}
      />
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogTitle(props: AlertDialogPrimitive.Title.Props) {
  const { ...titleProps } = props;
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className="text-lg font-medium"
      {...titleProps}
    />
  );
}

export function AlertDialogDescription(props: AlertDialogPrimitive.Description.Props) {
  const { ...descriptionProps } = props;
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className="text-sm text-muted-foreground"
      {...descriptionProps}
    />
  );
}

export function AlertDialogCancel(props: AlertDialogPrimitive.Close.Props) {
  const { ...closeProps } = props;
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      render={<Button variant="outline" type="button" />}
      {...closeProps}
    />
  );
}
