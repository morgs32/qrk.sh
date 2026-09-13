"use client";

import { Schema } from "effect";
import { useUser } from "@clerk/react";
import { collectionsHash } from "@qrk.sh/bricks";
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
  const navigate = useNavigate();
  const params = useValidatedParams(ParamsSchema);
  const { user } = useUser();
  const pageKey = JSON.stringify([user?.id, params.siteId, params.pageId]);
  const brickDef = useBrickDrawerStore(
    (state) => state.pageGrids[pageKey]?.bricksById[params.brickId],
  );
  const collection = brickDef ? collectionsHash[brickDef.collectionName] : undefined;
  const variant = brickDef ? collection?.variants[brickDef.variant] : undefined;
  const brick = brickDef ? variant?.sizes[brickDef.size] : undefined;
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
              All collections
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
                to={href("/:username/site/:siteId/page/:pageId/brick-catalog/:collectionName", {
                  ...params,
                  collectionName: brick.def.collectionName,
                })}
                className="inline-flex items-center gap-2 text-sm"
              >
                <ArrowLeft aria-hidden className="size-4" />
                <span>Back to {brick.def.collectionLabel}</span>
              </Link>
              <p className="mb-0 mt-8 text-sm text-muted-foreground">Brick detail</p>
              <h1
                className="mb-1 mt-2 text-4xl font-semibold tracking-tight"
                data-testid="brick-detail-title"
              >
                {brick.def.label}
              </h1>
              <p className="mt-0 font-mono text-sm text-muted-foreground">
                {brick.def.collectionName}/{brick.def.variant}/{brick.def.size}
              </p>
            </div>
            <div className="mt-8 overflow-auto">
              <div
                className="qrk-bricks overflow-hidden"
                data-testid="selected-brick-preview"
                style={{
                  width: `${(brick.def.w / 8) * 100}%`,
                  aspectRatio: `${brick.def.w} / ${brick.def.h}`,
                }}
              >
                {variant?.defaultData === undefined ? (
                  <BrickComponent />
                ) : (
                  <BrickComponent data={variant.defaultData} />
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
