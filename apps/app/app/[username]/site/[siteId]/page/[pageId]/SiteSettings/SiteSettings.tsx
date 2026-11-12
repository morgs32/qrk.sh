import { useSession } from "@zerospin/react";
("use client");

import { stageAggregateSessionCommand } from "@zerospin/sdk/browser";

/* oxlint-disable next/no-img-element -- App uses Vite, so Next image optimization is unavailable. */

import { useAuth } from "@clerk/react";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { ClerkOfflineError } from "@clerk/react/errors";
import { Button } from "@qrk.sh/bricks/components/button";
import { Checkbox } from "@qrk.sh/bricks/components/checkbox";
import { CroppedImage } from "@qrk.sh/bricks/components/CroppedImage";
import {
  Field as BrickField,
  FieldContent,
  FieldDescription as BrickFieldDescription,
  FieldError,
  FieldLabel as BrickFieldLabel,
} from "@qrk.sh/bricks/components/field";
import { Input } from "@qrk.sh/bricks/components/Input";
import { ImageUploadInput } from "@qrk.sh/bricks/components/ImageUploadInput";
import { Slider } from "@qrk.sh/bricks/components/slider";
import { StudioSidebar } from "@qrk.sh/bricks/components/StudioSidebar";
import { TextboxInput } from "@qrk.sh/bricks/components/TextboxInput";

import { Schema } from "effect";
import { isEqual } from "es-toolkit";
import { ExternalLink } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";

import { CopyButton } from "./CopyButton";

import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@qrk.sh/bricks/components/input-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUsername } from "@/hooks/useUsername";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { useWarnBeforeUnload } from "@qrk.sh/bricks/modules/react/useWarnBeforeUnload";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.TemplateLiteral(["sit_", Schema.String]),
  pageId: Schema.String,
});

const siteImageFields = [
  { field: "logoUrl", label: "Logo", description: "PNG or SVG, up to 48px tall recommended" },
  { field: "faviconLightUrl", label: "Light favicon", description: "64 × 64 pixels" },
  { field: "faviconDarkUrl", label: "Dark favicon", description: "64 × 64 pixels" },
] as const;
const siteImageTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

async function uploadSiteImage(props: {
  file: File;
  siteId: string;
  sessionToken: string;
  signal: AbortSignal;
}): Promise<{ url: string }> {
  const { file, siteId, sessionToken, signal } = props;
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is required");
  }

  const formData = new FormData();
  formData.set("file", file);
  formData.set("siteId", siteId);

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/upload`, {
    method: "POST",
    signal,
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
    slug: string | null;
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
  const formId = useId();
  const [saveSlot, setSaveSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setSaveSlot(document.getElementById("site-settings-save-slot"));
  }, []);
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
  const [socialPreview, setSocialPreview] = useState<{
    imageUrl: string;
    crop: Parameters<typeof CroppedImage>[0]["crop"] | null;
  }>({ imageUrl: "", crop: null });
  const socialPreviewObjectUrl = useRef<string>(null);
  useEffect(
    () => () => {
      if (socialPreviewObjectUrl.current !== null) {
        URL.revokeObjectURL(socialPreviewObjectUrl.current);
      }
    },
    [],
  );
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
  const uploadRequest = useRef<AbortController | null>(null);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string | undefined>>({});
  const isUploading = uploadingField !== null;
  useEffect(() => () => uploadRequest.current?.abort(), []);
  useWarnBeforeUnload(isDirty || isUploading);
  const publishedUrl = useMemo(() => {
    const pathname = `/${encodeURIComponent(username)}/${encodeURIComponent(siteId)}`;
    return `https://www.qrk.sh${pathname}`;
  }, [siteId, username]);
  const siteDomain = site.slug ? `${site.slug}.qrk.sh` : null;

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

  const runUpload = async (file: File, field: (typeof siteImageFields)[number]["field"]) => {
    if (uploadRequest.current !== null) return;
    if (file.size === 0 || file.size > 5 * 1024 * 1024 || !siteImageTypes.includes(file.type)) {
      setUploadErrors((current) => ({
        ...current,
        [field]: "Choose a PNG, JPEG, WebP, or SVG image up to 5 MiB.",
      }));
      return;
    }

    const request = new AbortController();
    uploadRequest.current = request;
    const { signal } = request;
    setUploadingField(field);
    setUploadErrors((current) => ({ ...current, [field]: undefined }));
    try {
      const localUrl = URL.createObjectURL(file);
      try {
        const image = new Image();
        image.src = localUrl;
        await image.decode();
      } catch {
        throw new Error("This image could not be loaded. Choose another file.");
      } finally {
        URL.revokeObjectURL(localUrl);
      }
      signal.throwIfAborted();
      const sessionToken = await getToken().catch((cause) => {
        if (ClerkOfflineError.is(cause)) throw new Error("Clerk is offline");
        throw cause;
      });
      if (sessionToken === null) throw new Error("Sign in to upload images");
      signal.throwIfAborted();
      const { url } = await uploadSiteImage({ file, siteId: params.siteId, sessionToken, signal });
      signal.throwIfAborted();
      setFields((current) => ({ ...current, [field]: url }));
    } catch (cause) {
      if (!signal.aborted) {
        const message = cause instanceof Error ? cause.message : "Image upload failed.";
        setUploadErrors((current) => ({ ...current, [field]: message }));
      }
    } finally {
      uploadRequest.current = null;
      if (!signal.aborted) setUploadingField(null);
    }
  };

  return (
    <form
      id={formId}
      autoComplete="off"
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        if (uploadRequest.current !== null) return;
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
      {saveSlot &&
        createPortal(
          <Button type="submit" form={formId} size="sm" disabled={!isDirty || isUploading}>
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
        <BrickField orientation="horizontal">
          <BrickFieldLabel htmlFor="site-name-and-wordmark">Site name</BrickFieldLabel>
          <Input
            variant="sm"
            id="site-name-and-wordmark"
            value={fields.name}
            onChange={(event) => setFields({ ...fields, name: event.target.value })}
          />
        </BrickField>

        <BrickField orientation="horizontal">
          <BrickFieldLabel htmlFor="site-subdomain">Site subdomain</BrickFieldLabel>
          <Input variant="sm" id="site-subdomain" value={site.slug ?? ""} placeholder="Not set" readOnly />
        </BrickField>

        <BrickField orientation="horizontal">
          <BrickFieldLabel htmlFor="site-description">Description</BrickFieldLabel>
          <TextboxInput
            id="site-description"
            value={fields.description}
            onChange={(event) => setFields({ ...fields, description: event.target.value })}
          />
        </BrickField>

        {siteImageFields.map(({ field, label, description }) => {
          const id = `site-${field}`;
          const imageUrl = fields[field];
          const error = uploadErrors[field];
          const dark = field === "faviconDarkUrl";
          return (
            <BrickField key={field} orientation="horizontal">
              <BrickFieldLabel htmlFor={id}>{label}</BrickFieldLabel>
              <FieldContent>
                <Input
                  variant="sm"
                  id={id}
                  type="file"
                  accept={siteImageTypes.join(",")}
                  disabled={isUploading}
                  aria-invalid={error !== undefined || undefined}
                  aria-describedby={error === undefined ? `${id}-help` : `${id}-help ${id}-error`}
                  onChange={(event) => {
                    const { currentTarget } = event;
                    const file = currentTarget.files?.[0];
                    if (file === undefined) return;
                    currentTarget.value = "";
                    void runUpload(file, field);
                  }}
                />
                {field === "logoUrl" ? (
                  imageUrl && (
                    <img
                      src={imageUrl}
                      alt="Current site logo"
                      className="max-h-12 w-fit max-w-full object-contain"
                    />
                  )
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex w-24 min-w-0 flex-col overflow-hidden rounded-md border"
                  >
                    <span
                      className={`flex items-center gap-1 border-b px-1.5 py-1 ${dark ? "bg-zinc-900" : "bg-background"}`}
                    >
                      {imageUrl ? (
                        <img src={imageUrl} alt="" className="size-4 rounded-sm object-cover" />
                      ) : (
                        <span
                          className={`size-4 shrink-0 rounded-sm ${dark ? "bg-zinc-700" : "bg-muted"}`}
                        />
                      )}
                      <span
                        className={`h-2 min-w-0 flex-1 rounded ${dark ? "bg-zinc-600" : "bg-muted/80"}`}
                      />
                    </span>
                    <span className={`h-7 ${dark ? "bg-zinc-950" : "bg-background"}`} />
                  </span>
                )}
                <BrickFieldDescription id={`${id}-help`}>{description}</BrickFieldDescription>
                {uploadingField === field && (
                  <BrickFieldDescription role="status">Uploading…</BrickFieldDescription>
                )}
                {error !== undefined && (
                  <FieldError id={`${id}-error`}>{error}</FieldError>
                )}
              </FieldContent>
            </BrickField>
          );
        })}
      </div>
      <StudioSidebar
        embedded
        hideDividers
        label="Site settings"
        sections={[
          {
            title: "Design",
            content: (
              <>
                <BrickField orientation="horizontal">
                  <BrickFieldLabel htmlFor="site-card-style">Cards</BrickFieldLabel>
                  <FieldContent>
                    <Checkbox
                      id="site-card-style"
                      className="mt-1.5"
                      aria-describedby="site-card-style-help"
                      checked={fields.cardStyle}
                      onCheckedChange={(cardStyle) =>
                        setFields((current) => ({ ...current, cardStyle }))
                      }
                    />
                    <BrickFieldDescription id="site-card-style-help">
                      Show each brick as a card
                    </BrickFieldDescription>
                  </FieldContent>
                </BrickField>

                <BrickField orientation="horizontal">
                  <BrickFieldLabel id="site-brick-gap-label">Brick gap</BrickFieldLabel>
                  <FieldContent>
                    <Slider
                      className="flex items-center gap-2"
                      thumbAlignment="edge"
                      thumbLabelledBy="site-brick-gap-label"
                      thumbDescribedBy="site-brick-gap-help"
                      min={0}
                      max={12}
                      step={1}
                      value={fields.brickGap}
                      onValueChange={(brickGap) =>
                        setFields((current) => ({ ...current, brickGap }))
                      }
                    >
                      <SliderPrimitive.Value className="w-7 shrink-0 text-right text-xs tabular-nums">
                        {(_formattedValues, [brickGap]) => `${brickGap}px`}
                      </SliderPrimitive.Value>
                    </Slider>
                    <BrickFieldDescription id="site-brick-gap-help">
                      Space between bricks, from 0 to 12 pixels
                    </BrickFieldDescription>
                  </FieldContent>
                </BrickField>

                <BrickField orientation="horizontal">
                  <BrickFieldLabel htmlFor="site-sticky-navbar">Sticky navbar</BrickFieldLabel>
                  <FieldContent>
                    <Checkbox
                      id="site-sticky-navbar"
                      className="mt-1.5"
                      aria-describedby="site-sticky-navbar-help"
                      checked={fields.stickyNavbar}
                      onCheckedChange={(stickyNavbar) =>
                        setFields((current) => ({ ...current, stickyNavbar }))
                      }
                    />
                    <BrickFieldDescription id="site-sticky-navbar-help">
                      Keep the navbar visible while scrolling
                    </BrickFieldDescription>
                  </FieldContent>
                </BrickField>
              </>
            ),
          },
          {
            title: "Social Preview",
            content: (
              <>
                <ImageUploadInput
                  label="Social image"
                  description="1200 × 630 pixels. Preview only."
                  imageUrl={socialPreview.imageUrl}
                  crop={socialPreview.crop}
                  getFrameAspectRatio={() => 1200 / 630}
                  onApply={(source) => {
                    const objectUrl = socialPreviewObjectUrl.current;
                    if (objectUrl !== null && objectUrl !== source.imageUrl) {
                      URL.revokeObjectURL(objectUrl);
                      socialPreviewObjectUrl.current = null;
                    }
                    setSocialPreview(source);
                  }}
                  uploadImage={async (file, { signal }) => {
                    signal.throwIfAborted();
                    if (socialPreviewObjectUrl.current !== null) {
                      URL.revokeObjectURL(socialPreviewObjectUrl.current);
                    }
                    socialPreviewObjectUrl.current = URL.createObjectURL(file);
                    return socialPreviewObjectUrl.current;
                  }}
                />
                {socialPreview.imageUrl && (
                  <div className="relative aspect-[1200/630] w-full overflow-hidden rounded-md border bg-muted">
                    <CroppedImage
                      key={socialPreview.imageUrl}
                      src={socialPreview.imageUrl}
                      alt="Social preview"
                      crop={socialPreview.crop ?? { x: 0.5, y: 0.5, zoom: 1 }}
                    />
                  </div>
                )}
              </>
            ),
          },
          {
            title: "Sharing",
            content: (
              <>
                <BrickField aria-labelledby="site-domains-label">
                  <span
                    id="site-domains-label"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Domains
                  </span>
                  <FieldContent>
                    {siteDomain === null ? (
                      <BrickFieldDescription className="flex min-h-7 items-center">
                        No subdomain set
                      </BrickFieldDescription>
                    ) : (
                      <InputGroup variant="sm">
                        <InputGroupInput
                          aria-labelledby="site-domains-label"
                          title={siteDomain}
                          value={siteDomain}
                          readOnly
                          className="truncate font-mono"
                        />
                        <InputGroupAddon align="inline-end" className="shrink-0 gap-0 py-0">
                          <TooltipProvider delay={0}>
                            <CopyButton text={siteDomain} label="Copy domain" inline />
                          </TooltipProvider>
                          <Button
                            nativeButton={false}
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Open domain in a new tab"
                            render={
                              <a
                                href={`https://${siteDomain}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                role="link"
                                onClick={(event) => event.stopPropagation()}
                              />
                            }
                          >
                            <ExternalLink className="size-3.5" aria-hidden />
                          </Button>
                        </InputGroupAddon>
                      </InputGroup>
                    )}
                  </FieldContent>
                </BrickField>
                <BrickField aria-labelledby="site-share-url-label">
                  <span
                    id="site-share-url-label"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Share URL
                  </span>
                  <InputGroup variant="sm">
                    <InputGroupInput
                      aria-labelledby="site-share-url-label"
                      title={publishedUrl}
                      value={publishedUrl}
                      readOnly
                      className="truncate font-mono"
                    />
                    <InputGroupAddon align="inline-end" className="shrink-0 gap-0 py-0">
                      <TooltipProvider delay={0}>
                        <CopyButton text={publishedUrl} inline />
                      </TooltipProvider>
                    </InputGroupAddon>
                  </InputGroup>
                </BrickField>
                <BrickField aria-labelledby="site-qr-code-label">
                  <span
                    id="site-qr-code-label"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    QR Code
                  </span>
                  <FieldContent>
                    <div className="aspect-square w-40 max-w-full overflow-hidden rounded-md border bg-background">
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
                  </FieldContent>
                </BrickField>
              </>
            ),
          },
          ...(site.isPublished
            ? [
                {
                  title: "Danger Zone",
                  content: (
                    <BrickField orientation="horizontal" aria-labelledby="site-publishing-label">
                      <span
                        id="site-publishing-label"
                        className="flex min-h-7 items-center text-xs font-medium text-muted-foreground"
                      >
                        Publishing
                      </span>
                      <FieldContent>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="self-start"
                          disabled
                        >
                          Unpublish
                        </Button>
                      </FieldContent>
                    </BrickField>
                  ),
                },
              ]
            : []),
        ]}
      />
    </form>
  );
}
