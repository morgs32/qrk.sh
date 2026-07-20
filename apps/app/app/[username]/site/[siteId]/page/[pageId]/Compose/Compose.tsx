"use client";

import { Schema } from "effect";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";

import { ComposeDrawerTiptap } from "./ComposeDrawerTiptap";
import { Button } from "@/components/ui/button";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { pagePattern } from "../../../routePatterns";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

export function Compose() {
  const params = useValidatedParams(ParamsSchema);
  const router = useRouter();

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold">Compose</div>
            <div className="text-xs text-muted-foreground">
              Rich text blocks with formatting. Content is kept in the site draft.
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="cursor-pointer"
            aria-label="Close drawer"
            onClick={() => router.push(pagePattern.href({ ...params }))}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="px-6 py-6 pb-8">
          <ComposeDrawerTiptap />
        </div>
      </div>
    </div>
  );
}
