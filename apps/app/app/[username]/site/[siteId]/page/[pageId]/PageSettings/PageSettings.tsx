"use client";

import { Globe } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { Schema } from "effect";

import { UserUI } from "@/zerospin/UserUI";
import { Button } from "@/components/ui/button";

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

export function PageSettings(props: {
  page: { id: `pag_${string}`; title: string; description: string };
}) {
  const { page } = props;
  const params = useValidatedParams(ParamsSchema);
  const session = UserUI.useSession();
  const navigate = useNavigate();
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const [fields, setFields] = useState(() => ({
    title: page.title,
    description: page.description,
  }));
  const [saveError, setSaveError] = useState<string | null>(null);
  const isDirty = fields.title !== page.title || fields.description !== page.description;

  return (
    <form
      autoComplete="off"
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        setSaveError(null);
        const result = stageAggregateSessionCommand({
          session,
          contractName: "updatePageSettings",
          payload: {
            id: page.id,
            title: fields.title.length > 0 ? fields.title : null,
            description: fields.description.length > 0 ? fields.description : null,
          },
        });
        if (result._tag === "Failure") setSaveError(result.failure.message);
      }}
    >
      <div className="space-y-8 px-4 py-6">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="page-title">Title</Label>
            <Input
              id="page-title"
              value={fields.title}
              onChange={(event) => setFields({ ...fields, title: event.target.value })}
            />
          </div>

          <div className="flex flex-col gap-6 md:flex-row md:items-stretch md:gap-6">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              <Label htmlFor="page-description">Description</Label>
              <Textarea
                id="page-description"
                className="min-h-[126px] flex-1 resize-y field-sizing-fixed"
                value={fields.description}
                onChange={(event) => setFields({ ...fields, description: event.target.value })}
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
                    {fields.title}
                  </a>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {fields.description}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
        {saveError === null ? null : <p role="alert" className="text-sm text-destructive">{saveError}</p>}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={!isDirty}>Save</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigate({
                to: "/$username/site/$siteId/page/$pageId",
                params,
                search: { breakpoint: search.breakpoint },
                resetScroll: false,
              });
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
