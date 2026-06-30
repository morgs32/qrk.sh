"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pagePattern } from "../../../routePatterns";
import { useParams, useRouter } from "next/navigation";

export function BrickDetail() {
  const router = useRouter();
  const params = useParams<{ siteId: string; pageId: string; brickId: string }>();
  const brickId = params.brickId;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
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

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6 py-6">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="brick-detail-title">
          {brickId}
        </h1>
      </div>
    </div>
  );
}
