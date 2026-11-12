"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { imageCropSchema } from "../modules/image/definition/imageV2";

import { Button } from "./button";
import { CroppedImage } from "./CroppedImage";
import { DialogContent } from "./dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "./field";
import { Slider } from "./slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { TextInput } from "./TextInput";

export function ImageUploadInput(
  props: {
    label: string;
    imageUrl: string;
    crop: typeof imageCropSchema.Type | null;
    onApply: (source: { imageUrl: string; crop: typeof imageCropSchema.Type | null }) => void;
    saveError?: string;
    description?: string;
    preview?: ReactNode;
    disabled?: boolean;
  } & (
    | {
        getFrameAspectRatio: () => number;
        uploadImage?: (file: File, options: { signal: AbortSignal }) => Promise<string>;
      }
    | {
        getFrameAspectRatio?: never;
        uploadImage: (file: File, options: { signal: AbortSignal }) => Promise<string>;
      }
  ),
) {
  const {
    label,
    imageUrl,
    crop,
    getFrameAspectRatio,
    onApply,
    saveError,
    uploadImage,
    description,
    preview,
    disabled,
  } = props;
  const canCrop = getFrameAspectRatio !== undefined;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("crop");
  const [url, setUrl] = useState("");
  const [source, setSource] = useState("");
  const [file, setFile] = useState<File>();
  const [draft, setDraft] = useState<typeof imageCropSchema.Type | null>(null);
  const [ratio, setRatio] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [applying, setApplying] = useState(false);
  const objectUrl = useRef<string>(null);
  const request = useRef<AbortController | null>(null);
  const centered = { x: 0.5, y: 0.5, zoom: 1 };
  const framing = draft ?? centered;
  const tabClass =
    "flex-none rounded-md px-2 py-1.5 text-xs text-muted-foreground data-active:bg-form-input data-active:text-foreground data-active:shadow-none";

  useEffect(
    () => () => {
      request.current?.abort();
      if (objectUrl.current !== null) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  function releaseSource() {
    if (objectUrl.current !== null) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  }

  function close() {
    request.current?.abort();
    request.current = null;
    releaseSource();
    setApplying(false);
    setOpen(false);
  }

  function replaceSource(next: string, localFile?: File) {
    setLoaded(next === source && loaded);
    setSource(next);
    setFile(localFile);
    setDraft(next === imageUrl ? crop : centered);
    setError(undefined);
    if (canCrop) setTab("crop");
  }

  function pan(x: number, y: number) {
    setDraft({ ...framing, x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
  }

  async function apply() {
    if (!loaded || applying || request.current !== null) return;
    setError(undefined);
    if (file === undefined) {
      onApply({ imageUrl: source, crop: draft });
      close();
      return;
    }
    if (uploadImage === undefined) return;
    const controller = new AbortController();
    request.current = controller;
    setApplying(true);
    try {
      const uploadedUrl = await uploadImage(file, { signal: controller.signal });
      if (controller.signal.aborted) return;
      onApply({ imageUrl: uploadedUrl, crop: canCrop ? draft : null });
      close();
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Image upload failed.");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setApplying(false);
      }
    }
  }

  const uploadField = (
    <FieldGroup>
      <TextInput
        label="Choose image"
        error={tab === "upload" ? error : undefined}
        aria-invalid={(tab === "upload" && error !== undefined) || undefined}
        id={`${id}-file`}
        type="file"
        disabled={applying}
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={(event) => {
          const picked = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (picked === undefined) return;
          if (
            picked.size === 0 ||
            picked.size > 5 * 1024 * 1024 ||
            !["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(picked.type)
          ) {
            setError("Choose a PNG, JPEG, WebP, or SVG image up to 5 MiB.");
            return;
          }
          releaseSource();
          objectUrl.current = URL.createObjectURL(picked);
          replaceSource(objectUrl.current, picked);
        }}
      />
    </FieldGroup>
  );

  return (
    <Field orientation="horizontal">
      <FieldLabel htmlFor={`${id}-trigger`} id={id}>
        {label}
      </FieldLabel>
      <FieldContent>
        <Dialog.Root
          open={open}
          onOpenChange={(next) => {
            if (!next) {
              close();
              return;
            }
            if (canCrop) setRatio(getFrameAspectRatio());
            setSource(imageUrl);
            setUrl(imageUrl);
            setDraft(crop);
            setFile(undefined);
            setLoaded(false);
            setError(undefined);
            setTab(
              !canCrop
                ? "upload"
                : imageUrl
                  ? "crop"
                  : uploadImage === undefined
                    ? "url"
                    : "upload",
            );
            setOpen(true);
          }}
        >
          <Dialog.Trigger
            type="button"
            disabled={disabled}
            id={`${id}-trigger`}
            aria-labelledby={`${id} ${id}-image`}
            aria-describedby={
              [
                description === undefined ? undefined : `${id}-help`,
                saveError === undefined ? undefined : `${id}-error`,
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-auto min-h-7 min-w-0 justify-between gap-1 rounded-(--radius-form-input) bg-form-input px-2 py-0.5 text-xs font-normal hover:bg-form-input hover:brightness-95"
              />
            }
          >
            <span id={`${id}-image`}>Image</span>
            {preview ??
              (imageUrl && (
                <img src={imageUrl} alt="" className="size-5 shrink-0 rounded-[4px] object-cover" />
              ))}
          </Dialog.Trigger>
          <DialogContent
            showCloseButton={false}
            className="max-h-[calc(100dvh-2rem)] overflow-auto"
          >
            <Dialog.Title className="text-sm font-semibold">
              {canCrop ? "Image" : label}
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              {canCrop ? "Choose an image and adjust its crop." : "Choose an image to upload."}
            </Dialog.Description>
            {!canCrop ? (
              <>
                {uploadField}
                {file !== undefined && (
                  <img
                    key={source}
                    src={source}
                    alt={`${label} preview`}
                    className="mx-auto max-h-48 max-w-full object-contain"
                    onLoad={() => setLoaded(true)}
                    onError={() => {
                      setLoaded(false);
                      setError("This image could not be loaded. Choose another file.");
                    }}
                  />
                )}
              </>
            ) : (
              <Tabs
                value={tab}
                onValueChange={(value) => {
                  if (typeof value !== "string") return;
                  setTab(value);
                  setError(undefined);
                }}
              >
                <TabsList
                  aria-label="Image options"
                  activateOnFocus
                  className="mb-3 flex h-auto flex-wrap justify-start gap-1 rounded-none border-b border-zinc-200 bg-transparent p-0 pb-2 dark:border-zinc-800"
                >
                  {uploadImage !== undefined && (
                    <TabsTrigger disabled={applying} value="upload" className={tabClass}>
                      Upload
                    </TabsTrigger>
                  )}
                  <TabsTrigger disabled={applying} value="url" className={tabClass}>
                    Paste from URL
                  </TabsTrigger>
                  <TabsTrigger disabled={!source || applying} value="crop" className={tabClass}>
                    Crop
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="upload" className="grid gap-2">
                  {uploadField}
                </TabsContent>
                <TabsContent value="url" className="grid gap-2">
                  <FieldGroup>
                    <TextInput
                      label="Image URL"
                      error={tab === "url" ? error : undefined}
                      aria-invalid={(tab === "url" && error !== undefined) || undefined}
                      id={`${id}-url`}
                      type="url"
                      value={url}
                      onChange={(event) => {
                        setUrl(event.currentTarget.value);
                        setError(undefined);
                      }}
                      placeholder="https://example.com/image.jpg"
                    />
                  </FieldGroup>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const next = URL.parse(url.trim());
                      if (
                        next === null ||
                        (next.protocol !== "https:" && next.protocol !== "http:")
                      ) {
                        setError("Enter an HTTP or HTTPS image URL.");
                        return;
                      }
                      releaseSource();
                      replaceSource(next.href);
                    }}
                  >
                    Continue to Crop
                  </Button>
                </TabsContent>
                <TabsContent value="crop" keepMounted className="grid gap-3 data-hidden:hidden">
                  {source && (
                    <div
                      className="relative mx-auto overflow-hidden rounded-md bg-muted ring-1 ring-border"
                      style={{ width: `min(100%, ${ratio * 320}px)`, aspectRatio: ratio }}
                    >
                      <CroppedImage
                        key={source}
                        src={source}
                        alt="Crop preview"
                        crop={framing}
                        onPan={applying ? undefined : pan}
                        onLoad={() => setLoaded(true)}
                        onError={() => {
                          setLoaded(false);
                          setError("This image could not be loaded. Choose another file or URL.");
                        }}
                      />
                    </div>
                  )}
                  <fieldset disabled={!loaded || applying} className="grid gap-2">
                    <FieldGroup>
                      <Field orientation="horizontal">
                        <FieldLabel id={`${id}-zoom`}>Zoom</FieldLabel>
                        <FieldContent>
                          <Slider
                            thumbLabelledBy={`${id}-zoom`}
                            min={1}
                            max={20}
                            step={0.05}
                            disabled={!loaded || applying}
                            value={framing.zoom}
                            onValueChange={(zoom) => setDraft({ ...framing, zoom })}
                          />
                        </FieldContent>
                      </Field>
                    </FieldGroup>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => pan(framing.x - 0.025, framing.y)}
                      >
                        Pan left
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => pan(framing.x + 0.025, framing.y)}
                      >
                        Pan right
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => pan(framing.x, framing.y - 0.025)}
                      >
                        Pan up
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => pan(framing.x, framing.y + 0.025)}
                      >
                        Pan down
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDraft(null)}
                      >
                        Clear crop
                      </Button>
                    </div>
                  </fieldset>
                </TabsContent>
              </Tabs>
            )}
            {tab === "crop" && error !== undefined && <FieldError>{error}</FieldError>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              {(!canCrop || tab === "crop") && (
                <Button type="button" disabled={!loaded || applying} onClick={() => void apply()}>
                  {applying ? "Uploading…" : "Apply"}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog.Root>
        {description === undefined ? null : (
          <FieldDescription id={`${id}-help`}>{description}</FieldDescription>
        )}
        {saveError === undefined ? null : <FieldError id={`${id}-error`}>{saveError}</FieldError>}
      </FieldContent>
    </Field>
  );
}
