"use client";

import * as React from "react";
import { MoreVertical, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Figma: https://www.figma.com/design/x1KYuaPaEo89CE715oUD4I/qrk.sh?node-id=46-459 */
export function BrickCatalogToolbar(props: {
  catalogEnabled: boolean;
  onCatalogEnabledChange: (next: boolean) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onOptionsClick?: () => void;
  onHideClick: () => void;
  onDoneClick: () => void;
  className?: string;
}) {
  const {
    catalogEnabled,
    onCatalogEnabledChange,
    searchValue,
    onSearchChange,
    onOptionsClick,
    onHideClick,
    onDoneClick,
    className,
  } = props;

  return (
    <div
      role="toolbar"
      aria-label="Brick catalog"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-zinc-950 px-4 py-3 text-white shadow-md",
        className,
      )}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        <span className="text-sm font-medium text-white">Bricks</span>
        <button
          type="button"
          role="switch"
          aria-checked={catalogEnabled}
          onClick={() => onCatalogEnabledChange(!catalogEnabled)}
          className={cn(
            "flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
            catalogEnabled ? "justify-end bg-emerald-500" : "justify-start bg-zinc-600",
          )}
        >
          <span className="size-6 rounded-full bg-white shadow-sm" aria-hidden />
        </button>
      </div>

      <div className="relative min-w-[12rem] max-w-md flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
          strokeWidth={2}
          aria-hidden
        />
        <Input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search..."
          aria-label="Search bricks"
          className="h-9 rounded-full border-0 bg-zinc-800/90 pl-9 text-sm text-white shadow-none placeholder:text-zinc-500 focus-visible:ring-white/25"
        />
      </div>

      <div className="ml-auto flex min-w-0 shrink-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 text-white hover:bg-zinc-800 hover:text-white"
          aria-label="More options"
          onClick={() => onOptionsClick?.()}
        >
          <MoreVertical className="size-5" strokeWidth={2} aria-hidden />
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-9 gap-1.5 rounded-full border-zinc-600 bg-transparent px-3 text-sm font-normal text-white hover:bg-zinc-800 hover:text-white"
          onClick={onHideClick}
        >
          Hide
          <X className="size-4" strokeWidth={2} aria-hidden />
        </Button>

        <Button
          type="button"
          className="h-9 rounded-xl bg-blue-800 px-5 text-sm font-medium text-white hover:bg-blue-700"
          onClick={onDoneClick}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
