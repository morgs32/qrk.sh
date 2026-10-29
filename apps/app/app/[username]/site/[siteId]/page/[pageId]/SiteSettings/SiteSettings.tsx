"use client";

import { stageAggregateSessionCommand } from "@zerospin/sdk/browser";

/* oxlint-disable next/no-img-element -- App uses Vite, so Next image optimization is unavailable. */

import { useAuth } from "@clerk/react";
import { ClerkOfflineError } from "@clerk/react/errors";

import { Schema } from "effect";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { isEqual } from "es-toolkit";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import useSWR from "swr";

import { CopyButton } from "./CopyButton";
import { SearchPreviewCard } from "../SearchPreviewCard";

import { UserUI } from "@/zerospin/UserUI";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FieldLabel } from "@/components/ui/field-label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUsername } from "@/hooks/useUsername";
import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.TemplateLiteral(["sit_", Schema.String]),
  pageId: Schema.String,
});

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

async function uploadSiteImage(props: {
  file: File;
  siteId: string;
  sessionToken: string;
}): Promise<{ url: string }> {
  const { file, siteId, sessionToken } = props;
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is required");
  }

  const formData = new FormData();
  formData.set("file", file);
  formData.set("siteId", siteId);

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
    body: formData,
  });

  const body = (await response.json().catch(() => null)) as {
    url?: string;
    message?: string;
    code?: string;
  } | null;

  if (!response.ok || body === null || typeof body.url !== "string") {
    throw new Error(body?.message ?? `Upload failed (${response.status})`);
  }

  return { url: body.url };
}

export function SiteSettings(props: {
  site: {
    id: `sit_${string}`;
    name: string;
    description: string;
    logoUrl: string;
    faviconLightUrl: string;
    faviconDarkUrl: string;
    cardStyle: boolean;
    brickGap: number;
    stickyNavbar: boolean;
    isPublished: boolean;
  };
}) {
  const { site } = props;
  const params = useValidatedParams(ParamsSchema);
  const username = useUsername();
  const { getToken } = useAuth();
  const session = UserUI.useSession();
  const siteId = site.id;
  const navigate = useNavigate();
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const [fields, setFields] = useState(() => ({
    name: site.name,
    description: site.description,
    logoUrl: site.logoUrl,
    faviconLightUrl: site.faviconLightUrl,
    faviconDarkUrl: site.faviconDarkUrl,
    cardStyle: site.cardStyle,
    brickGap: site.brickGap,
    stickyNavbar: site.stickyNavbar,
  }));
  const [headerActions, setHeaderActions] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const target = document.getElementById("site-settings-header-actions");
    if (target === null) throw new Error("Missing Site Settings header actions");
    setHeaderActions(target);
  }, []);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isDirty = !isEqual(fields, {
    name: site.name,
    description: site.description,
    logoUrl: site.logoUrl,
    faviconLightUrl: site.faviconLightUrl,
    faviconDarkUrl: site.faviconDarkUrl,
    cardStyle: site.cardStyle,
    brickGap: site.brickGap,
    stickyNavbar: site.stickyNavbar,
  });
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconLightInputRef = useRef<HTMLInputElement>(null);
  const faviconDarkInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const publishedUrl = useMemo(() => {
    const pathname = `/${encodeURIComponent(username)}/${encodeURIComponent(siteId)}`;
    return `https://www.qrk.sh${pathname}`;
  }, [siteId, username]);
  const publishedUrlDisplay = useMemo(
    () => publishedUrl.replace(/^https?:\/\//, ""),
    [publishedUrl],
  );

  const { data: qrDataUrl } = useSWR([username, siteId], async ([username, siteId]) => {
    const pathname = `/${encodeURIComponent(username)}/${encodeURIComponent(siteId)}`;
    const url = `https://www.qrk.sh${pathname}`;
    const { toDataURL } = await import("qrcode");
    return toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
    });
  });

  const runUpload = async (props: { file: File | undefined; onUrl: (url: string) => void }) => {
    const { file, onUrl } = props;
    if (file === undefined) {
      return;
    }

    setIsUploading(true);
    try {
      const sessionToken = await getToken().catch((cause) => {
        if (ClerkOfflineError.is(cause)) throw new Error("Clerk is offline");
        throw cause;
      });
      if (sessionToken === null) {
        toast.error("Sign in to upload images");
        return;
      }
      const result = await uploadSiteImage({
        file,
        siteId: params.siteId,
        sessionToken,
      });
      onUrl(result.url);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form
      id="site-settings-form"
      autoComplete="off"
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        setSaveError(null);
        const result = stageAggregateSessionCommand({
          session,
          contractName: "updateSiteSettings",
          payload: {
            id: site.id,
            name: fields.name.length > 0 ? fields.name : null,
            description: fields.description.length > 0 ? fields.description : null,
            logoUrl: fields.logoUrl.length > 0 ? fields.logoUrl : null,
            faviconLightUrl: fields.faviconLightUrl.length > 0 ? fields.faviconLightUrl : null,
            faviconDarkUrl: fields.faviconDarkUrl.length > 0 ? fields.faviconDarkUrl : null,
            cardStyle: fields.cardStyle,
            brickGap: fields.brickGap,
            stickyNavbar: fields.stickyNavbar,
          },
        });
        if (result._tag === "Failure") setSaveError(result.failure.message);
      }}
    >
      <div className="grid grid-cols-2 items-start gap-x-6 gap-y-8 px-4 py-6 md:gap-x-8">
        <div className="col-start-1 flex items-center justify-between gap-4">
          <FieldLabel htmlFor="site-card-style" description="Show each brick as a card">
            Cards
          </FieldLabel>
          <Switch
            id="site-card-style"
            checked={fields.cardStyle}
            onCheckedChange={(cardStyle) => setFields({ ...fields, cardStyle })}
          />
        </div>

        <div className="col-start-1 flex items-center justify-between gap-4">
          <FieldLabel
            htmlFor="site-brick-gap"
            description="Space between bricks, from 0 to 12 pixels"
          >
            Brick gap
          </FieldLabel>
          <div className="flex items-center gap-3">
            <input
              id="site-brick-gap"
              type="range"
              min={0}
              max={12}
              step={1}
              value={fields.brickGap}
              onChange={(event) => setFields({ ...fields, brickGap: Number(event.target.value) })}
            />
            <output htmlFor="site-brick-gap" className="w-10 text-right text-sm tabular-nums">
              {fields.brickGap}px
            </output>
          </div>
        </div>

        <div className="col-start-1 flex items-center justify-between gap-4">
          <FieldLabel
            htmlFor="site-sticky-navbar"
            description="Keep the navbar visible while scrolling"
          >
            Sticky navbar
          </FieldLabel>
          <input
            id="site-sticky-navbar"
            type="checkbox"
            checked={fields.stickyNavbar}
            onChange={(event) => setFields({ ...fields, stickyNavbar: event.target.checked })}
          />
        </div>

        <div className="contents">
          <div className="col-start-1 flex min-w-0 flex-col gap-4">
            <FieldLabel description="PNG or SVG; height up to 48px recommended">Logo</FieldLabel>
            <div className="flex flex-col items-start gap-4">
              <input
                ref={logoInputRef}
                type="file"
                accept={IMAGE_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void runUpload({
                    file,
                    onUrl: (logoUrl) => setFields((current) => ({ ...current, logoUrl })),
                  });
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={isUploading}
                onClick={() => logoInputRef.current?.click()}
              >
                Upload
              </Button>
              <div className="relative flex w-full max-w-[375px] min-h-16 items-center justify-center overflow-hidden rounded-md border bg-muted">
                {fields.logoUrl.length > 0 ? (
                  <img
                    src={fields.logoUrl}
                    alt="Site logo"
                    className="max-h-12 w-auto object-contain"
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">Logo</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <FieldLabel description="64 × 64 pixels">Favicon</FieldLabel>
            <div className="flex flex-wrap justify-start gap-4">
              <div className="flex flex-col items-start gap-2">
                <span className="text-xs text-muted-foreground">Light</span>
                <input
                  ref={faviconLightInputRef}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void runUpload({
                      file,
                      onUrl: (faviconLightUrl) =>
                        setFields((current) => ({ ...current, faviconLightUrl })),
                    });
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isUploading}
                  onClick={() => faviconLightInputRef.current?.click()}
                >
                  Upload
                </Button>
                <div className="flex w-36 flex-col overflow-hidden rounded-md border bg-muted/30">
                  <div className="flex items-center gap-1 border-b bg-background px-2 py-1.5">
                    {fields.faviconLightUrl.length > 0 ? (
                      <img
                        src={fields.faviconLightUrl}
                        alt="Light favicon"
                        className="size-4 shrink-0 rounded-sm object-cover"
                      />
                    ) : (
                      <div className="size-4 shrink-0 rounded-sm bg-muted" />
                    )}
                    <div className="h-2 min-w-0 flex-1 rounded bg-muted/80" />
                  </div>
                  <div className="h-16 bg-background" />
                </div>
              </div>
              <div className="flex flex-col items-start gap-2">
                <span className="text-xs text-muted-foreground">Dark</span>
                <input
                  ref={faviconDarkInputRef}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void runUpload({
                      file,
                      onUrl: (faviconDarkUrl) =>
                        setFields((current) => ({ ...current, faviconDarkUrl })),
                    });
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isUploading}
                  onClick={() => faviconDarkInputRef.current?.click()}
                >
                  Upload
                </Button>
                <div className="flex w-36 flex-col overflow-hidden rounded-md border bg-muted/30">
                  <div className="flex items-center gap-1 border-b bg-zinc-900 px-2 py-1.5">
                    {fields.faviconDarkUrl.length > 0 ? (
                      <img
                        src={fields.faviconDarkUrl}
                        alt="Dark favicon"
                        className="size-4 shrink-0 rounded-sm object-cover"
                      />
                    ) : (
                      <div className="size-4 shrink-0 rounded-sm bg-zinc-700" />
                    )}
                    <div className="h-2 min-w-0 flex-1 rounded bg-zinc-600" />
                  </div>
                  <div className="h-16 bg-zinc-950" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="contents">
          <div className="flex min-w-0 flex-col gap-2">
            <FieldLabel htmlFor="site-name-and-wordmark">Site name and wordmark</FieldLabel>
            <Input
              id="site-name-and-wordmark"
              value={fields.name}
              onChange={(event) => setFields({ ...fields, name: event.target.value })}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <FieldLabel htmlFor="site-description">Description</FieldLabel>
            <Textarea
              id="site-description"
              value={fields.description}
              onChange={(event) => setFields({ ...fields, description: event.target.value })}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <FieldLabel description="1200 × 630 pixels">Social Preview</FieldLabel>
          <div className="flex flex-col items-start gap-4">
            <Button type="button" variant="outline">
              Upload
            </Button>
            <div className="relative w-full max-w-[375px] overflow-hidden rounded-md border bg-muted">
              <div className="relative aspect-[375/197] w-full">
                <img
                  src="/assets/site-settings-social-preview.png"
                  alt="Social preview"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
                  className="object-cover"
                  sizes="(max-width: 767px) 100vw, 375px"
                  loading="eager"
                  fetchPriority="high"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="contents">
          <div className="flex min-w-0 flex-col gap-2">
            <FieldLabel>QR Code</FieldLabel>
            <div className="relative h-40 w-40 shrink-0 overflow-hidden rounded-md border bg-background">
              {qrDataUrl ? (
                <img
                  loading="lazy"
                  src={qrDataUrl}
                  alt="Published URL QR code"
                  className="h-full w-full object-contain"
                  width={256}
                  height={256}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                  Generating…
                </div>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <FieldLabel>Share URL</FieldLabel>
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1 truncate rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs text-foreground">
                {publishedUrl}
              </div>
              <TooltipProvider delayDuration={0}>
                <CopyButton text={publishedUrl} />
              </TooltipProvider>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel>Preview</FieldLabel>
          <SearchPreviewCard
            title={fields.name}
            url={publishedUrlDisplay}
            description={fields.description}
            faviconSrc={fields.faviconLightUrl.length > 0 ? fields.faviconLightUrl : undefined}
          />
        </div>

        {saveError === null ? null : (
          <p role="alert" className="col-span-2 text-sm text-destructive">
            {saveError}
          </p>
        )}
        {headerActions === null
          ? null
          : createPortal(
              <div className="flex items-center gap-2">
                <Button type="submit" form="site-settings-form" disabled={!isDirty || isUploading}>
                  Save
                </Button>
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
              </div>,
              headerActions,
            )}

        <div className="col-span-2 flex flex-col items-start gap-4">
          <div className="min-w-0">
            <FieldLabel description="Unpublish your website from all domains.">
              Danger Zone
            </FieldLabel>
          </div>
          <Button type="button" variant="destructive" disabled>
            Unpublish
          </Button>
        </div>
      </div>
    </form>
  );
}
