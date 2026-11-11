"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";

import { cn } from "cn";

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const { ...elementProps } = props;
  return <DialogPrimitive.Root data-slot="dialog" {...elementProps} />;
}

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  const { ...elementProps } = props;
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...elementProps} />;
}

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  const { ...elementProps } = props;
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...elementProps} />;
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  const { ...elementProps } = props;
  return <DialogPrimitive.Close data-slot="dialog-close" {...elementProps} />;
}

function DialogOverlay(props: React.ComponentProps<typeof DialogPrimitive.Backdrop>) {
  const { className, ...elementProps } = props;
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={(state) =>
        cn(
          "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-50 bg-black/50",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...elementProps}
    />
  );
}

function DialogContent(props: React.ComponentProps<typeof DialogPrimitive.Popup>) {
  const { className, children, ...elementProps } = props;
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={(state) =>
          cn(
            "bg-background data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
            typeof className === "function" ? className(state) : className,
          )
        }
        {...elementProps}
      >
        {children}
        <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-open:bg-accent data-open:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader(props: React.ComponentProps<"div">) {
  const { className, ...elementProps } = props;
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...elementProps}
    />
  );
}

function DialogFooter(props: React.ComponentProps<"div">) {
  const { className, ...elementProps } = props;
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...elementProps}
    />
  );
}

function DialogTitle(props: React.ComponentProps<typeof DialogPrimitive.Title>) {
  const { className, ...elementProps } = props;
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={(state) =>
        cn("text-lg leading-none", typeof className === "function" ? className(state) : className)
      }
      {...elementProps}
    />
  );
}

function DialogDescription(props: React.ComponentProps<typeof DialogPrimitive.Description>) {
  const { className, ...elementProps } = props;
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={(state) =>
        cn(
          "text-muted-foreground text-sm",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...elementProps}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
