"use client";
import { BrickPreviewFrame } from "@qrk.sh/bricks/BrickPreviewFrame";

import { useBrickBreakpoint } from "@qrk.sh/bricks/BrickBreakpointProvider";

import { Schema } from "effect";
import { useUser } from "@clerk/react";
import { catalogsHash } from "@qrk.sh/bricks";
import { useBrickDrawerStore } from "@/components/home/useBrickDrawerStore";
import { Link } from "react-router";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { href } from "react-router";
import { useNavigate } from "react-router";

import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
  brickId: Schema.String,
});

export function BrickDetail() {
  const { breakpoint } = useBrickBreakpoint();
  const navigate = useNavigate();
  const params = useValidatedParams(ParamsSchema);
  const { user } = useUser();
  const pageKey = JSON.stringify([user?.id, params.siteId, params.pageId]);
  const brickDef = useBrickDrawerStore(
    (state) => state.pageGrids[pageKey]?.bricksById[params.brickId],
  );
  const catalog = brickDef ? catalogsHash[brickDef.catalogName] : undefined;
  const content = brickDef ? catalog?.contents[brickDef.content] : undefined;
  const brick = brickDef ? content?.views[brickDef.view] : undefined;
  const BrickComponent = brick?.component;

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
            onClick={() => navigate(href("/:username/site/:siteId/page/:pageId", { ...params }))}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {!brick || !BrickComponent ? (
          <div className="px-6 pt-6" data-testid="brick-not-found">
            <Link to={href("/:username/site/:siteId/page/:pageId/brick-catalog", params)}>
              All catalogs
            </Link>
            <h1 className="mb-2 mt-8 text-4xl font-semibold tracking-tight">Brick not found</h1>
            <p className="text-muted-foreground">
              This brick is not available in this page's current session.
            </p>
          </div>
        ) : (
          <section data-testid="brick-detail-pane">
            <div className="px-6 pt-6">
              <Link
                to={href("/:username/site/:siteId/page/:pageId/brick-catalog/:catalogName", {
                  ...params,
                  catalogName: brick.def.catalogName,
                })}
                className="inline-flex items-center gap-2 text-sm"
              >
                <ArrowLeft aria-hidden className="size-4" />
                <span>Back to {brick.def.catalogLabel}</span>
              </Link>
              <p className="mb-0 mt-8 text-sm text-muted-foreground">Brick detail</p>
              <h1
                className="mb-1 mt-2 text-4xl font-semibold tracking-tight"
                data-testid="brick-detail-title"
              >
                {brick.def.label}
              </h1>
              <p className="mt-0 font-mono text-sm text-muted-foreground">
                {brick.def.catalogName}/{brick.def.content}/{brick.def.view}
              </p>
            </div>
            <div className="mt-8 overflow-auto">
              <BrickPreviewFrame w={brick.def.w} h={brick.def.h}>
                <div
                  className="size-full qrk-bricks overflow-hidden"
                  data-testid="selected-brick-preview"
                >
                  <BrickComponent breakpoint={breakpoint} data={content?.defaultData} />
                </div>
              </BrickPreviewFrame>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
