"use client";

import { Laptop, Monitor, Smartphone, Tablet } from "lucide-react";
import { Button } from "@qrk.sh/bricks/components/button";
import { TabsList, TabsTrigger } from "@qrk.sh/bricks/components/tabs";
import { BREAKPOINTS } from "../../../../../lib/breakpoints";

/** Breakpoint selection for the Wall preview. */
export function BreakpointsToolbar() {
  return (
    <TabsList aria-label="Breakpoints" size="sm">
      {BREAKPOINTS.map((row) => {
        const Icon = { sm: Smartphone, md: Tablet, lg: Laptop, xl: Monitor }[row.id];
        return (
          <TabsTrigger
            key={row.id}
            value={row.id}
            aria-label={`${row.id} preview width`}
            render={<Button type="button" variant="ghost" />}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {row.id}
          </TabsTrigger>
        );
      })}
    </TabsList>
  );
}
