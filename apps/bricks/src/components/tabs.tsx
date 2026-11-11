"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import { cn } from "cn";

function Tabs(props: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const { className, ...rootProps } = props;
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={(state) =>
        cn("flex flex-col gap-2", typeof className === "function" ? className(state) : className)
      }
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
      className={(state) =>
        cn(
          "group/tabs-list inline-flex h-9 items-center justify-center text-muted-foreground",
          variant === "line" ? "gap-3" : "rounded-full bg-muted p-1",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...listProps}
    />
  );
}

function TabsTrigger(props: React.ComponentProps<typeof TabsPrimitive.Tab>) {
  const { className, ...triggerProps } = props;
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={(state) =>
        cn(
          "inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border-0 px-2 py-1 text-sm font-normal whitespace-nowrap text-muted-foreground outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 data-active:bg-background data-active:text-foreground data-active:shadow-sm dark:data-active:bg-background [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          "group-data-[variant=line]/tabs-list:relative group-data-[variant=line]/tabs-list:h-full group-data-[variant=line]/tabs-list:flex-none group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:after:absolute group-data-[variant=line]/tabs-list:after:inset-x-0 group-data-[variant=line]/tabs-list:after:bottom-0 group-data-[variant=line]/tabs-list:after:h-0.5 group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-[variant=line]/tabs-list:data-active:shadow-none group-data-[variant=line]/tabs-list:data-active:after:bg-current dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...triggerProps}
    />
  );
}

function TabsContent(props: React.ComponentProps<typeof TabsPrimitive.Panel>) {
  const { className, ...contentProps } = props;
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={(state) =>
        cn(
          "mt-2 flex-1 outline-none",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...contentProps}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
