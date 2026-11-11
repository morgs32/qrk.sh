"use client";

import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { cn } from "cn";

export function Avatar(
  props: Omit<AvatarPrimitive.Root.Props, "className"> & { className?: string },
) {
  const { className, ...avatarProps } = props;
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "group/avatar relative flex size-8 shrink-0 overflow-hidden rounded-full select-none",
        className,
      )}
      {...avatarProps}
    />
  );
}

export function AvatarImage(
  props: Omit<AvatarPrimitive.Image.Props, "className"> & { className?: string },
) {
  const { className, ...imageProps } = props;
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full object-cover", className)}
      {...imageProps}
    />
  );
}

export function AvatarFallback(
  props: Omit<AvatarPrimitive.Fallback.Props, "className"> & { className?: string },
) {
  const { className, ...fallbackProps } = props;
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center bg-muted text-sm font-medium text-muted-foreground",
        className,
      )}
      {...fallbackProps}
    />
  );
}
