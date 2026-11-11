"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "cn";

function Tabs(props: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const { className, ...rootProps } = props;
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...rootProps}
    />
  );
}

function TabsList(
  props: React.ComponentProps<typeof TabsPrimitive.List> & { variant?: "default" | "line" },
) {
  const { className, variant = "default", ...listProps } = props;
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        "group/tabs-list inline-flex h-9 items-center justify-center text-muted-foreground",
        variant === "line" ? "gap-3" : "rounded-full bg-muted p-1",
        className,
      )}
      {...listProps}
    />
  );
}

function TabsTrigger(props: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const { className, ...triggerProps } = props;
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border-0 px-2 py-1 text-sm font-normal whitespace-nowrap text-muted-foreground outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:data-[state=active]:text-foreground data-[state=active]:shadow-sm dark:data-[state=active]:bg-background [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:relative group-data-[variant=line]/tabs-list:h-full group-data-[variant=line]/tabs-list:flex-none group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:after:absolute group-data-[variant=line]/tabs-list:after:inset-x-0 group-data-[variant=line]/tabs-list:after:bottom-0 group-data-[variant=line]/tabs-list:after:h-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none group-data-[variant=line]/tabs-list:data-[state=active]:after:bg-current dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        className,
      )}
      {...triggerProps}
    />
  );
}

function TabsContent(props: React.ComponentProps<typeof TabsPrimitive.Content>) {
  const { className, ...contentProps } = props;
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("mt-2 flex-1 outline-none", className)}
      {...contentProps}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
