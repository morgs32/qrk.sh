"use client";

import { useUser } from "@clerk/react";
import { Schema } from "effect";
import { FileText, Globe, X } from "lucide-react";
import { useNavigate } from "react-router";
import { useState } from "react";
import { createStore, useStore } from "zustand";
import { useLiveQuery } from "@zerospin/react";
import { ZerospinUser } from "@/components/ZerospinUser";

import { href } from "react-router";
import { useSiteStore } from "../../../siteStore";

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

export function PageSettings() {
  const params = useValidatedParams(ParamsSchema);
  const navigate = useNavigate();
  const { user } = useUser();
  const pageDraft = useSiteStore((state) =>
    user === null || user === undefined
      ? undefined
      : state.owners[user.id]?.sites[params.siteId]?.pages[params.pageId],
  );
  const setPageDescription = useSiteStore((state) => state.setPageDescription);
  const { data: page, error } = useLiveQuery(ZerospinUser, {
    deps: [params.pageId, params.siteId],
    query: (db) =>
      db.query.page.findFirst({
        where: { id: { eq: params.pageId }, siteId: { eq: params.siteId } },
      }),
  });
  const resourceTitle = page?.title ?? "";
  const [draft, setDraft] = useState(() => ({
    pageId: page?.id,
    store: createStore(() => ({ title: resourceTitle })),
  }));
  // Initialize when the resource arrives or the page changes, not when its title updates.
  if (draft.pageId !== page?.id) {
    setDraft({
      pageId: page?.id,
      store: createStore(() => ({ title: resourceTitle })),
    });
  }
  const titleStore = draft.store;
  const title = useStore(titleStore, (state) => state.title);

  if (error !== undefined) {
    throw error;
  }

  if (user === null || user === undefined || pageDraft === undefined || page === undefined) {
    return null;
  }

  return (
    <div className="w-full">
      <header className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-border bg-muted/95 px-4 py-2.5 backdrop-blur-sm">
        <FileText className="size-5 shrink-0 text-foreground" strokeWidth={2} aria-hidden />
        <h1 className="min-w-0 flex-1 text-base font-semibold tracking-tight">Page Settings</h1>
        <div className="flex shrink-0 items-center gap-1">
          {title !== resourceTitle ? (
            <Button type="button" size="sm">
              Save
            </Button>
          ) : null}
          <Button
            type="button"
            variant={title !== resourceTitle ? "destructive" : "ghost"}
            size={title !== resourceTitle ? "sm" : "icon"}
            className={title !== resourceTitle ? "h-8 cursor-pointer" : "size-8 cursor-pointer"}
            aria-label={title !== resourceTitle ? "Cancel" : "Close drawer"}
            onClick={() => navigate(href("/:username/site/:siteId/page/:pageId", { ...params }))}
          >
            <X className="size-3.5" />
            {title !== resourceTitle ? "Cancel" : null}
          </Button>
        </div>
      </header>

      <div className="space-y-8 px-4 py-6">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="page-title">Title</Label>
            <Input
              id="page-title"
              value={title}
              onChange={(event) => titleStore.setState({ title: event.target.value })}
            />
          </div>

          <div className="flex flex-col gap-6 md:flex-row md:items-stretch md:gap-6">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              <Label htmlFor="page-description">Description</Label>
              <Textarea
                id="page-description"
                className="min-h-[126px] flex-1 resize-y field-sizing-fixed"
                value={pageDraft.description}
                onChange={(event) =>
                  setPageDescription(user.id, params.siteId, params.pageId, event.target.value)
                }
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
                    {title}
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
