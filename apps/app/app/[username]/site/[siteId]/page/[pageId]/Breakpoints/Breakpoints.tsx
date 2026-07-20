"use client";

import { useUser } from "@clerk/nextjs";
import { Schema } from "effect";
import { RectangleHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { pagePattern } from "../../../routePatterns";
import { useSiteStore } from "../../../siteStore";

import { BREAKPOINT_ROWS, type BreakpointPrefix } from "./breakpointRows";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

export function Breakpoints() {
  const params = useValidatedParams(ParamsSchema);
  const router = useRouter();
  const { user } = useUser();
  const [selectedPrefix, setSelectedPrefix] = useState<BreakpointPrefix | null>(
    BREAKPOINT_ROWS[0].prefix,
  );
  const breakpointGridColumnCounts = useSiteStore((state) =>
    user === null || user === undefined
      ? undefined
      : state.owners[user.id]?.sites[params.siteId]?.pages[params.pageId]
          ?.breakpointGridColumnCounts,
  );
  const setBreakpointGridColumnCount = useSiteStore((state) => state.setBreakpointGridColumnCount);

  const gridColumnCount =
    selectedPrefix === null ? undefined : breakpointGridColumnCounts?.[selectedPrefix];

  if (user === null || user === undefined || breakpointGridColumnCounts === undefined) {
    return null;
  }

  return (
    <div className="w-full">
      <header className="sticky top-0 z-10 grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border bg-muted/95 px-4 py-2.5 backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-2 justify-self-start">
          <RectangleHorizontal
            className="size-5 shrink-0 text-foreground"
            strokeWidth={2}
            aria-hidden
          />
          <h1 className="min-w-0 truncate text-base font-semibold tracking-tight">Breakpoints</h1>
        </div>
        <div className="flex min-w-0 max-w-full shrink-0 items-center justify-center justify-self-center">
          <div className="inline-flex max-w-full shrink-0 items-center gap-0.5 overflow-hidden rounded-full bg-muted p-1 md:hidden">
            <Label htmlFor="breakpoints-prefix" className="sr-only">
              Breakpoint
            </Label>
            <Select
              value={selectedPrefix ?? undefined}
              onValueChange={(v) => {
                const row = BREAKPOINT_ROWS.find((r) => r.prefix === v);
                if (row) setSelectedPrefix(row.prefix);
              }}
            >
              <SelectTrigger
                id="breakpoints-prefix"
                size="sm"
                className="h-8 w-[min(12rem,calc(100vw-12rem))] min-w-[7rem] rounded-md border-0 bg-transparent shadow-none focus-visible:ring-2"
              >
                <SelectValue placeholder="Breakpoint" />
              </SelectTrigger>
              <SelectContent>
                {BREAKPOINT_ROWS.map((row) => {
                  const Icon = row.Icon;
                  return (
                    <SelectItem key={row.prefix} value={row.prefix}>
                      <span className="flex items-center gap-2">
                        {Icon && <Icon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />}
                        <span>
                          {row.prefix} — {row.minWidth}
                        </span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:bg-background/80 hover:text-foreground"
              disabled={selectedPrefix === null}
              aria-label="Clear breakpoint selection"
              onClick={() => setSelectedPrefix(null)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
          <div className="hidden min-w-0 max-w-full shrink-0 items-center gap-1 rounded-full bg-muted p-1 md:inline-flex">
            <Label id="breakpoints-tabs-label" className="sr-only">
              Breakpoint
            </Label>
            <Tabs
              value={selectedPrefix ?? undefined}
              onValueChange={(v) => {
                const row = BREAKPOINT_ROWS.find((r) => r.prefix === v);
                if (row) setSelectedPrefix(row.prefix);
              }}
              className="flex min-w-0 flex-1 flex-row items-stretch gap-0"
              aria-labelledby="breakpoints-tabs-label"
            >
              <TabsList className="h-8 min-h-8 w-full min-w-0 max-w-full justify-start gap-1 overflow-x-auto rounded-full border-0 bg-transparent p-0 shadow-none">
                {BREAKPOINT_ROWS.map((row) => {
                  const Icon = row.Icon;
                  return (
                    <TabsTrigger
                      key={row.prefix}
                      value={row.prefix}
                      className="h-7 min-w-[4.25rem] shrink-0 flex-none gap-1.5 px-3 text-xs [&_svg]:shrink-0"
                    >
                      {Icon && <Icon className="size-3.5" strokeWidth={2} aria-hidden />}
                      {row.prefix}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:bg-background/80 hover:text-foreground"
              disabled={selectedPrefix === null}
              aria-label="Clear breakpoint selection"
              onClick={() => setSelectedPrefix(null)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end justify-self-end gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-3"
            onClick={() => router.push(pagePattern.href({ ...params }))}
          >
            Done
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 cursor-pointer"
            aria-label="Close drawer"
            onClick={() => router.push(pagePattern.href({ ...params }))}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </header>
      <div className="px-4 py-6">
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Grid columns</legend>
          <RadioGroup
            value={gridColumnCount === undefined ? undefined : String(gridColumnCount)}
            disabled={selectedPrefix === null}
            onValueChange={(value) => {
              if (selectedPrefix === null) {
                return;
              }

              setBreakpointGridColumnCount(
                user.id,
                params.siteId,
                params.pageId,
                selectedPrefix,
                value === "2" ? 2 : 1,
              );
            }}
            className="flex flex-row flex-wrap gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="1" id="breakpoints-grid-cols-1" />
              <Label htmlFor="breakpoints-grid-cols-1" className="cursor-pointer font-normal">
                1 column
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="2" id="breakpoints-grid-cols-2" />
              <Label htmlFor="breakpoints-grid-cols-2" className="cursor-pointer font-normal">
                2 columns
              </Label>
            </div>
          </RadioGroup>
        </fieldset>
      </div>
    </div>
  );
}
