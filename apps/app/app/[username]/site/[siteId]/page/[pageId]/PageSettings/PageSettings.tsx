import { useSession } from "@zerospin/react";
("use client");

/* oxlint-disable next/no-img-element -- App uses Vite, so Next image optimization is unavailable. */

import { X } from "lucide-react";
import { useId, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ISessionModelRow } from "@zerospin/browser/ISessionModelRow";
import { stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { Schema } from "effect";

import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { Button } from "@qrk.sh/bricks/components/button";

import { Field, FieldError, FieldLabel } from "@qrk.sh/bricks/components/field";
import { Input } from "@qrk.sh/bricks/components/Input";
import { StudioSidebar } from "@qrk.sh/bricks/components/StudioSidebar";
import { TextboxInput } from "@qrk.sh/bricks/components/TextboxInput";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { useWarnBeforeUnload } from "@qrk.sh/bricks/modules/react/useWarnBeforeUnload";

import { SearchPreviewCard } from "../SearchPreviewCard";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.TemplateLiteral(["sit_", Schema.String]),
  pageId: Schema.TemplateLiteral(["pag_", Schema.String]),
});

export function PageSettings(props: {
  page: ISessionModelRow<typeof userSessionDefinition, "page", { with: { site: true } }>;
}) {
  const { page } = props;
  const { faviconLightUrl, faviconDarkUrl } = page.site;
  const savedTitle = page.title ?? "";
  const savedDescription = page.description ?? "";
  const params = useValidatedParams(ParamsSchema);
  const session = useSession(userSessionDefinition);
  const formId = useId();
  const [saveSlot, setSaveSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setSaveSlot(document.getElementById("page-settings-save-slot"));
  }, []);
  const [fields, setFields] = useState(() => ({
    title: savedTitle,
    description: savedDescription,
  }));
  const [saveError, setSaveError] = useState<string | null>(null);
  const isDirty = fields.title !== savedTitle || fields.description !== savedDescription;
  useWarnBeforeUnload(isDirty);
  const sitePath = `/${encodeURIComponent(params.username)}/${encodeURIComponent(params.siteId)}`;
  const pagePath = page.slug ? `/${page.slug.split("/").map(encodeURIComponent).join("/")}` : "";
  const previewUrl = `www.qrk.sh${sitePath}${pagePath}`;

  return (
    <form
      id={formId}
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
      {saveSlot &&
        createPortal(
          <Button type="submit" form={formId} size="sm" disabled={!isDirty}>
            Save
          </Button>,
          saveSlot,
        )}
      {saveError === null ? null : (
        <div className="sticky top-0 z-10 bg-background px-3 py-2">
          <FieldError>{saveError}</FieldError>
        </div>
      )}
      <div className="grid gap-3 px-3 py-3">
        <Field orientation="horizontal">
          <FieldLabel htmlFor="page-title">Title</FieldLabel>
          <Input
            variant="sm"
            id="page-title"
            placeholder={page.site.name ?? undefined}
            value={fields.title}
            onChange={(event) => setFields({ ...fields, title: event.target.value })}
          />
        </Field>
        <Field orientation="horizontal">
          <FieldLabel htmlFor="page-description">Description</FieldLabel>
          <TextboxInput
            id="page-description"
            placeholder={page.site.description ?? undefined}
            value={fields.description}
            onChange={(event) => setFields({ ...fields, description: event.target.value })}
          />
        </Field>
      </div>
      <StudioSidebar
        embedded
        label="Page previews"
        sections={[
          {
            title: "Previews",
            content: (
              <>
                <Field aria-labelledby="search-result-preview-label">
                  <span
                    id="search-result-preview-label"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Search result
                  </span>
                  <SearchPreviewCard
                    title={fields.title}
                    url={previewUrl}
                    description={fields.description}
                    faviconSrc={faviconLightUrl || undefined}
                  />
                </Field>
                <Field aria-labelledby="browser-tab-preview-label">
                  <span
                    id="browser-tab-preview-label"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Browser tab
                  </span>
                  <div className="overflow-hidden rounded-lg border border-sidebar-border bg-[#dbe5f5] dark:bg-zinc-900">
                    <div className="mx-2 mt-2 flex h-8 max-w-56 min-w-0 items-center gap-2 rounded-t-lg bg-[#f7faff] px-3 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
                      <img
                        src={faviconLightUrl || "/favicon-light.png"}
                        alt=""
                        className="size-4 shrink-0 object-contain dark:hidden"
                      />
                      <img
                        src={faviconDarkUrl || faviconLightUrl || "/favicon-light.png"}
                        alt=""
                        className="hidden size-4 shrink-0 object-contain dark:block"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {fields.title || "Untitled page"}
                      </span>
                      <X aria-hidden className="size-3 shrink-0" />
                    </div>
                    <div className="h-2 bg-[#f7faff] dark:bg-zinc-800" />
                  </div>
                </Field>
              </>
            ),
          },
        ]}
      />
    </form>
  );
}
