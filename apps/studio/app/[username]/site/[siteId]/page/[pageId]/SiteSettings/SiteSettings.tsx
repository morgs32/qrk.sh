"use client";

import { useAuth } from "@clerk/react";
import { useSession } from "@zerospin/react";
import { ZerospinError } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { Globe, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { href, useNavigate } from "react-router";
import { toast } from "sonner";
import useSWR from "swr";

import { useSiteStore } from "../../../siteStore";
import { CopyButton } from "./CopyButton";
import { SearchPreviewCard } from "../SearchPreviewCard";

import { useZerospinUserInitializedState, ZerospinUser } from "@/components/ZerospinUser";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field-label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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

function pickSerializableSite(site: {
  name: string;
  description: string;
  logoUrl: string;
  faviconLightUrl: string;
  faviconDarkUrl: string;
}) {
  return {
    name: site.name,
    description: site.description,
    logoUrl: site.logoUrl,
    faviconLightUrl: site.faviconLightUrl,
    faviconDarkUrl: site.faviconDarkUrl,
  };
}

function emptyToNull(value: string): string | null {
  return value.length > 0 ? value : null;
}

async function uploadSiteImage(props: {
  file: File;
  siteId: string;
  sessionToken: string;
}): Promise<{ url: string }> {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is required");
  }

  const formData = new FormData();
  formData.set("file", props.file);
  formData.set("siteId", props.siteId);

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${props.sessionToken}`,
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

export function SiteSettings() {
  const params = useValidatedParams(ParamsSchema);
  const navigate = useNavigate();
  const username = useUsername();
  const { getToken } = useAuth();
  const session = useSession(ZerospinUser);
  const siteId = params.siteId;
  const { db } = useZerospinUserInitializedState();
  const siteDraft = useSiteStore((state) => state.site);
  const setName = useSiteStore((state) => state.setName);
  const setDescription = useSiteStore((state) => state.setDescription);
  const setLogoUrl = useSiteStore((state) => state.setLogoUrl);
  const setFaviconLightUrl = useSiteStore((state) => state.setFaviconLightUrl);
  const setFaviconDarkUrl = useSiteStore((state) => state.setFaviconDarkUrl);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconLightInputRef = useRef<HTMLInputElement>(null);
  const faviconDarkInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [baselineState, setBaselineState] = useState(() => {
    const site = db.query.site
      .findFirst({
        where: { id: { eq: params.siteId } },
      })
      .sync();
    if (site === undefined) {
      throw new Error(`Site ${params.siteId} not found`);
    }
    return {
      siteId: params.siteId,
      baseline: {
        name: site.name ?? "",
        description: site.description ?? "",
        logoUrl: site.logoUrl ?? "",
        faviconLightUrl: site.faviconLightUrl ?? "",
        faviconDarkUrl: site.faviconDarkUrl ?? "",
      },
    };
  });

  // Re-query when the site changes without remount; do not refresh when draft fields update.
  if (baselineState.siteId !== params.siteId) {
    const site = db.query.site
      .findFirst({
        where: { id: { eq: params.siteId } },
      })
      .sync();
    if (site === undefined) {
      throw new Error(`Site ${params.siteId} not found`);
    }
    setBaselineState({
      siteId: params.siteId,
      baseline: {
        name: site.name ?? "",
        description: site.description ?? "",
        logoUrl: site.logoUrl ?? "",
        faviconLightUrl: site.faviconLightUrl ?? "",
        faviconDarkUrl: site.faviconDarkUrl ?? "",
      },
    });
  }

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

  if (siteDraft === null || siteDraft.id !== params.siteId || baselineState.siteId !== params.siteId) {
    return null;
  }

  const baseline = baselineState.baseline;
  const draft = pickSerializableSite(siteDraft);
  const isDirty =
    draft.name !== baseline.name ||
    draft.description !== baseline.description ||
    draft.logoUrl !== baseline.logoUrl ||
    draft.faviconLightUrl !== baseline.faviconLightUrl ||
    draft.faviconDarkUrl !== baseline.faviconDarkUrl;

  const runUpload = async (props: {
    file: File | undefined;
    onUrl: (url: string) => void;
  }) => {
    if (props.file === undefined) {
      return;
    }

    setIsUploading(true);
    try {
      const sessionToken = await getToken();
      if (sessionToken === null) {
        toast.error("Sign in to upload images");
        return;
      }
      const result = await uploadSiteImage({
        file: props.file,
        siteId: params.siteId,
        sessionToken,
      });
      props.onUrl(result.url);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full">
      <header className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-border bg-muted/95 px-4 py-2.5 backdrop-blur-sm">
        <Globe className="size-5 shrink-0 text-foreground" strokeWidth={2} aria-hidden />
        <h1 className="min-w-0 flex-1 text-base font-semibold tracking-tight">Site Settings</h1>
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
                  contractName: "updateSiteSettings",
                  payload: {
                    id: params.siteId,
                    name: emptyToNull(draft.name),
                    description: emptyToNull(draft.description),
                    logoUrl: emptyToNull(draft.logoUrl),
                    faviconLightUrl: emptyToNull(draft.faviconLightUrl),
                    faviconDarkUrl: emptyToNull(draft.faviconDarkUrl),
                  },
                });

                if (result._tag === "Failure") {
                  toast.error(new ZerospinError(result.failure).message);
                  return;
                }

                setBaselineState({
                  siteId: params.siteId,
                  baseline: structuredClone(draft),
                });
              }}
            >
              Save
            </Button>
          ) : null}
          <Button type="button" size="sm">
            Publish
          </Button>
          <Button
            type="button"
            variant={isDirty ? "destructive" : "ghost"}
            size={isDirty ? "sm" : "icon"}
            className={isDirty ? "h-8 cursor-pointer" : "size-8 cursor-pointer"}
            aria-label={isDirty ? "Cancel" : "Close drawer"}
            onClick={() => {
              if (isDirty) {
                setName(baseline.name);
                setDescription(baseline.description);
                setLogoUrl(baseline.logoUrl);
                setFaviconLightUrl(baseline.faviconLightUrl);
                setFaviconDarkUrl(baseline.faviconDarkUrl);
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
        <div className="grid grid-cols-2 items-start gap-6 md:gap-8">
          <div className="flex min-w-0 flex-col gap-4">
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
                  void runUpload({ file, onUrl: setLogoUrl });
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
                {draft.logoUrl.length > 0 ? (
                  <img
                    src={draft.logoUrl}
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
                    void runUpload({ file, onUrl: setFaviconLightUrl });
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
                    {draft.faviconLightUrl.length > 0 ? (
                      <img
                        src={draft.faviconLightUrl}
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
                    void runUpload({ file, onUrl: setFaviconDarkUrl });
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
                    {draft.faviconDarkUrl.length > 0 ? (
                      <img
                        src={draft.faviconDarkUrl}
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

        <div className="grid grid-cols-2 items-start gap-6 md:gap-8">
          <div className="flex min-w-0 flex-col gap-2">
            <FieldLabel htmlFor="site-name-and-wordmark">Site name and wordmark</FieldLabel>
            <Input
              id="site-name-and-wordmark"
              value={siteDraft.name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <FieldLabel htmlFor="site-description">Description</FieldLabel>
            <Textarea
              id="site-description"
              value={siteDraft.description}
              onChange={(event) => setDescription(event.target.value)}
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

        <div className="grid grid-cols-2 items-start gap-6 md:gap-8">
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
            title={siteDraft.name}
            url={publishedUrlDisplay}
            description={siteDraft.description}
            faviconSrc={
              draft.faviconLightUrl.length > 0
                ? draft.faviconLightUrl
                : undefined
            }
          />
        </div>

        <Separator />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <FieldLabel description="Unpublish your website from all domains.">
              Danger Zone
            </FieldLabel>
          </div>
          <Button type="button" variant="destructive" className="shrink-0">
            Unpublish
          </Button>
        </div>
      </div>
    </div>
  );
}
