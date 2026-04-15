"use client";

import { RectangleHorizontal, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { pagePattern } from "../../../routePatterns";

import { Button } from "@/components/ui/button";

export function Breakpoints() {
  const params = useParams<{ siteId: string; pageId: string }>();
  const router = useRouter();

  return (
    <div className="w-full">
      <header className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-border bg-muted/95 px-4 py-2.5 backdrop-blur-sm">
        <RectangleHorizontal
          className="size-5 shrink-0 text-foreground"
          strokeWidth={2}
          aria-hidden
        />
        <h1 className="min-w-0 flex-1 text-base font-semibold tracking-tight">Breakpoints</h1>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="outline" size="sm" className="h-8 px-3">
            Save
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
    </div>
  );
}
