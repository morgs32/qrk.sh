"use client";

import { Globe } from "lucide-react";
import { Schema } from "effect";

import { usePageStore } from "../pageStore";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.TemplateLiteral(["sit_", Schema.String]),
  pageId: Schema.TemplateLiteral(["pag_", Schema.String]),
});

export function PageSettings() {
  const params = useValidatedParams(ParamsSchema);
  const pageDraft = usePageStore((state) => state.page);
  const setTitle = usePageStore((state) => state.setTitle);
  const setDescription = usePageStore((state) => state.setDescription);
  if (pageDraft === null || pageDraft.id !== params.pageId) return null;

  return (
    <div className="w-full">
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
      </div>
    </div>
  );
}
