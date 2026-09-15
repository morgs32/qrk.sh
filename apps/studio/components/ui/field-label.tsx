"use client";

import * as React from "react";

import { cn } from "cn";

import { Label } from "@/components/ui/label";

function FieldLabel({
  className,
  description,
  children,
  ...props
}: React.ComponentProps<typeof Label> & {
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className={cn("text-base font-medium", className)} {...props}>
        {children}
      </Label>
      {description === undefined ? null : (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export { FieldLabel };
