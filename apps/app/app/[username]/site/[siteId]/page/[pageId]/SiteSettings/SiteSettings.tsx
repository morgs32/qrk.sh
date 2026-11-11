import { useSession } from "@zerospin/react";
("use client");

import { stageAggregateSessionCommand } from "@zerospin/sdk/browser";

/* oxlint-disable next/no-img-element -- App uses Vite, so Next image optimization is unavailable. */

import { useAuth } from "@clerk/react";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { ClerkOfflineError } from "@clerk/react/errors";

import { Schema } from "effect";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { isEqual } from "es-toolkit";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { CopyButton } from "./CopyButton";
import { SearchPreviewCard } from "../SearchPreviewCard";

import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUsername } from "@/hooks/useUsername";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { useWarnBeforeUnload } from "@qrk.sh/bricks/modules/react/useWarnBeforeUnload";

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
  const session = useSession(userSessionDefinition);
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
  useWarnBeforeUnload(isDirty || isUploading);
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
      <div className="grid grid-cols-2 items-start gap-x-6 gap-y-8 px-4 py-6 md:gap-x-8 @max-sm/workspace:[[data-workspace-sidebar]_&]:grid-cols-1">
        <Field orientation="horizontal" className="col-start-1 justify-between gap-4">
          <div className="space-y-1">
            <FieldLabel htmlFor="site-card-style" className="text-base">
              Cards
            </FieldLabel>
            <FieldDescription id="site-card-style-help">Show each brick as a card</FieldDescription>
          </div>
          <Switch
            id="site-card-style"
            aria-describedby="site-card-style-help"
            checked={fields.cardStyle}
            onCheckedChange={(cardStyle) => setFields({ ...fields, cardStyle })}
          />
        </Field>

        <Field
          orientation="horizontal"
          className="col-start-1 justify-between gap-4 @max-sm/workspace:[[data-workspace-sidebar]_&]:flex-col @max-sm/workspace:[[data-workspace-sidebar]_&]:items-stretch"
        >
          <div className="space-y-1">
            <FieldLabel id="site-brick-gap-label" className="text-base">
              Brick gap
            </FieldLabel>
            <FieldDescription id="site-brick-gap-help">
              Space between bricks, from 0 to 12 pixels
            </FieldDescription>
          </div>
          <Slider
            className="flex w-44 max-w-full shrink-0 items-center gap-3"
            thumbLabelledBy="site-brick-gap-label"
            thumbDescribedBy="site-brick-gap-help"
            min={0}
            max={12}
            step={1}
            value={fields.brickGap}
            onValueChange={(brickGap) => setFields({ ...fields, brickGap })}
          >
            <SliderPrimitive.Value className="w-10 shrink-0 text-right text-sm tabular-nums">
              {(_formattedValues, [brickGap]) => `${brickGap}px`}
            </SliderPrimitive.Value>
          </Slider>
        </Field>

        <Field orientation="horizontal" className="col-start-1 justify-between gap-4">
          <div className="space-y-1">
            <FieldLabel htmlFor="site-sticky-navbar" className="text-base">
              Sticky navbar
            </FieldLabel>
            <FieldDescription id="site-sticky-navbar-help">
              Keep the navbar visible while scrolling
            </FieldDescription>
          </div>
          <Switch
            id="site-sticky-navbar"
            aria-describedby="site-sticky-navbar-help"
            checked={fields.stickyNavbar}
            onCheckedChange={(stickyNavbar) => setFields({ ...fields, stickyNavbar })}
          />
        </Field>

        <div className="contents">
          <div className="col-start-1 flex min-w-0 flex-col gap-4">
            <div className="space-y-1">
              <h3 className="font-medium">Logo</h3>
              <FieldDescription id="site-logo-help">
                PNG or SVG; height up to 48px recommended
              </FieldDescription>
            </div>
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
                aria-describedby="site-logo-help"
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
            <div className="space-y-1">
              <h3 className="font-medium">Favicon</h3>
              <FieldDescription id="site-favicon-help">64 × 64 pixels</FieldDescription>
            </div>
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
                  aria-describedby="site-favicon-help"
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
                  aria-describedby="site-favicon-help"
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
          <Field>
            <FieldLabel htmlFor="site-name-and-wordmark" className="text-base">
              Site name and wordmark
            </FieldLabel>
            <Input
              id="site-name-and-wordmark"
              value={fields.name}
              onChange={(event) => setFields({ ...fields, name: event.target.value })}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="site-description" className="text-base">
              Description
            </FieldLabel>
            <Textarea
              id="site-description"
              value={fields.description}
              onChange={(event) => setFields({ ...fields, description: event.target.value })}
            />
          </Field>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="space-y-1">
            <h3 className="font-medium">Social Preview</h3>
            <FieldDescription id="site-social-preview-help">1200 × 630 pixels</FieldDescription>
          </div>
          <div className="flex flex-col items-start gap-4">
            <Button type="button" variant="outline" aria-describedby="site-social-preview-help">
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
            <h3 className="font-medium">QR Code</h3>
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
            <h3 className="font-medium">Share URL</h3>
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1 truncate rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs text-foreground">
                {publishedUrl}
              </div>
              <TooltipProvider delay={0}>
                <CopyButton text={publishedUrl} />
              </TooltipProvider>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="font-medium">Preview</h3>
          <SearchPreviewCard
            title={fields.name}
            url={publishedUrlDisplay}
            description={fields.description}
            faviconSrc={fields.faviconLightUrl.length > 0 ? fields.faviconLightUrl : undefined}
          />
        </div>

        {saveError === null ? null : <FieldError className="col-span-full">{saveError}</FieldError>}
        <div className="col-span-full flex items-center gap-2">
          <Button type="submit" disabled={!isDirty || isUploading}>
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
        </div>

        <div className="col-span-full flex flex-col items-start gap-4">
          <div className="min-w-0 space-y-1">
            <h3 className="font-medium">Danger Zone</h3>
            <FieldDescription id="site-unpublish-help">
              Unpublish your website from all domains.
            </FieldDescription>
          </div>
          <Button
            type="button"
            variant="destructive"
            aria-describedby="site-unpublish-help"
            disabled
          >
            Unpublish
          </Button>
        </div>
      </div>
    </form>
  );
}
