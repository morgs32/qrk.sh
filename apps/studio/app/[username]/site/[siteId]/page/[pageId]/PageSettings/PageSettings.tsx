"use client";

import { useSession } from "@zerospin/react";
import { ZerospinError } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { FileText, Globe, X } from "lucide-react";
import { useState } from "react";
import { href, useNavigate } from "react-router";
import { toast } from "sonner";

import { usePageStore } from "../pageStore";

import { useZerospinUserInitializedState, ZerospinUser } from "@/components/ZerospinUser";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.TemplateLiteral(["sit_", Schema.String]),
  pageId: Schema.TemplateLiteral(["pag_", Schema.String]),
});

function pickSerializablePage(page: { title: string; description: string }) {
  return {
    title: page.title,
    description: page.description,
  };
}

function emptyToNull(value: string): string | null {
  return value.length > 0 ? value : null;
}

export function PageSettings() {
  const params = useValidatedParams(ParamsSchema);
  const navigate = useNavigate();
  const session = useSession(ZerospinUser);
  const { db } = useZerospinUserInitializedState();
  const pageDraft = usePageStore((state) => state.page);
  const setTitle = usePageStore((state) => state.setTitle);
  const setDescription = usePageStore((state) => state.setDescription);
  const [baselineState, setBaselineState] = useState(() => {
    const page = db.query.page
      .findFirst({
        where: { id: { eq: params.pageId }, siteId: { eq: params.siteId } },
      })
      .sync();
    if (page === undefined) {
      throw new Error(`Page ${params.pageId} not found`);
    }
    return {
      pageId: params.pageId,
      baseline: {
        title: page.title ?? "",
        description: page.description ?? "",
      },
    };
  });

  // Re-query when the page changes without remount; do not refresh when draft fields update.
  if (baselineState.pageId !== params.pageId) {
    const page = db.query.page
      .findFirst({
        where: { id: { eq: params.pageId }, siteId: { eq: params.siteId } },
      })
      .sync();
    if (page === undefined) {
      throw new Error(`Page ${params.pageId} not found`);
    }
    setBaselineState({
      pageId: params.pageId,
      baseline: {
        title: page.title ?? "",
        description: page.description ?? "",
      },
    });
  }

  if (
    pageDraft === null ||
    pageDraft.id !== params.pageId ||
    baselineState.pageId !== params.pageId
  ) {
    return null;
  }

  const baseline = baselineState.baseline;
  const draft = pickSerializablePage(pageDraft);
  const isDirty = draft.title !== baseline.title || draft.description !== baseline.description;

  return (
    <div className="w-full">
      <header className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-border bg-muted/95 px-4 py-2.5 backdrop-blur-sm">
        <FileText className="size-5 shrink-0 text-foreground" strokeWidth={2} aria-hidden />
        <h1 className="min-w-0 flex-1 text-base font-semibold tracking-tight">Page Settings</h1>
        <div className="flex shrink-0 items-center gap-1">
          {isDirty ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const state = session.store.getState();
                if (!state.isInitialized) {
                  toast.error("Your session is not ready");
                  return;
                }

                const result = session.executeCommand({
                  contractName: "updatePageSettings",
                  payload: {
                    id: params.pageId,
                    title: emptyToNull(draft.title),
                    description: emptyToNull(draft.description),
                  },
                });

                if (result._tag === "Failure") {
                  toast.error(new ZerospinError(result.failure).message);
                  return;
                }

                setBaselineState({
                  pageId: params.pageId,
                  baseline: structuredClone(draft),
                });
              }}
            >
              Save
            </Button>
          ) : null}
          <Button
            type="button"
            variant={isDirty ? "destructive" : "ghost"}
            size={isDirty ? "sm" : "icon"}
            className={isDirty ? "h-8 cursor-pointer" : "size-8 cursor-pointer"}
            aria-label={isDirty ? "Cancel" : "Close drawer"}
            onClick={() => {
              if (isDirty) {
                setTitle(baseline.title);
                setDescription(baseline.description);
              }
              navigate(href("/:username/site/:siteId/page/:pageId", { ...params }));
            }}
          >
            <X className="size-3.5" />
            {isDirty ? "Cancel" : null}
          </Button>
        </div>
      </header>

      <div className="space-y-8 px-4 py-6">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="page-title">Title</Label>
            <Input
              id="page-title"
              value={pageDraft.title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-6 md:flex-row md:items-stretch md:gap-6">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              <Label htmlFor="page-description">Description</Label>
              <Textarea
                id="page-description"
                className="min-h-[126px] flex-1 resize-y field-sizing-fixed"
                value={pageDraft.description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              <Label>Preview</Label>
              {/* Fixed-height SERP mock; description column can grow taller via flex-1 textarea */}
              <Card className="max-h-[126px] max-w-[400px] shrink-0 overflow-hidden py-4 shadow-none">
                <CardContent className="min-w-0 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Globe className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">makeitrainey.framer.website</span>
                  </div>
                  <a
                    href="#"
                    className="block truncate text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                    onClick={(e) => e.preventDefault()}
                  >
                    {pageDraft.title}
                  </a>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {pageDraft.description}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="font-medium">Danger Zone</div>
            <p className="text-sm text-muted-foreground">
              Unpublish your website from all domains.
            </p>
          </div>
          <Button type="button" variant="destructive" className="shrink-0">
            Unpublish
          </Button>
        </div>
      </div>
    </div>
  );
}
