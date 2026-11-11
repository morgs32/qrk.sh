"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { X } from "lucide-react";

import { Button } from "./button";

// shadcn Base UI Dialog parts with the compact Brick editor surface.
export function DialogContent(
  props: Omit<DialogPrimitive.Popup.Props, "className"> & {
    className?: string;
    showCloseButton?: boolean;
  },
) {
  const { className, children, showCloseButton = true, ...popupProps } = props;
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-overlay"
        className="fixed inset-0 z-50 bg-black/40"
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "qrk-bricks fixed top-1/2 left-1/2 z-50 grid w-md max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 gap-3 rounded-lg bg-background p-4 text-xs text-foreground shadow-lg outline-none",
          className,
        )}
        {...popupProps}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={<Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" />}
            aria-label="Close"
          >
            <X aria-hidden />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}
