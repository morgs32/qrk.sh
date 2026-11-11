"use client";

import { Slider } from "@base-ui/react/slider";
import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { useEffect, useId, useRef, useState } from "react";
import type { imageCropSchema } from "../image/definition/imageV2";

import { Button } from "./button";
import { CroppedImage } from "./CroppedImage";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "./field";
import { TextInput } from "./TextInput";

export function ImageUploadInput(props: {
  label: string;
  imageUrl: string;
  crop: typeof imageCropSchema.Type | null;
  getFrameAspectRatio: () => number;
  onApply: (source: { imageUrl: string; crop: typeof imageCropSchema.Type | null }) => void;
  saveError?: string;
  uploadImage?: (file: File, options: { signal: AbortSignal }) => Promise<string>;
}) {
  const { label, imageUrl, crop, getFrameAspectRatio, onApply, saveError, uploadImage } = props;
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
    "rounded-md px-2 py-1.5 text-muted-foreground data-active:bg-form-input data-active:text-foreground";

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
    setTab("crop");
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
      onApply({ imageUrl: uploadedUrl, crop: draft });
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
            setRatio(getFrameAspectRatio());
            setSource(imageUrl);
            setUrl(imageUrl);
            setDraft(crop);
            setFile(undefined);
            setLoaded(false);
            setError(undefined);
            setTab(imageUrl ? "crop" : uploadImage === undefined ? "url" : "upload");
            setOpen(true);
          }}
        >
          <Dialog.Trigger
            type="button"
            id={`${id}-trigger`}
            aria-labelledby={`${id} ${id}-image`}
            aria-describedby={saveError === undefined ? undefined : `${id}-error`}
            className="flex h-7 min-w-0 items-center justify-between gap-1 rounded-(--radius-form-input) bg-form-input px-2 text-xs outline-none hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span id={`${id}-image`}>Image</span>
            {imageUrl && (
              <img src={imageUrl} alt="" className="size-5 shrink-0 rounded-[4px] object-cover" />
            )}
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
            <Dialog.Popup className="qrk-bricks fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-md max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 gap-3 overflow-auto rounded-lg bg-background p-4 text-xs text-foreground shadow-lg">
              <Dialog.Title className="text-sm font-semibold">Image</Dialog.Title>
              <Dialog.Description className="sr-only">
                Choose an image and adjust its crop.
              </Dialog.Description>
              <Tabs.Root
                value={tab}
                onValueChange={(value) => {
                  if (typeof value !== "string") return;
                  setTab(value);
                  setError(undefined);
                }}
              >
                <Tabs.List
                  aria-label="Image options"
                  activateOnFocus
                  className="mb-3 flex flex-wrap gap-1 border-b border-border pb-2"
                >
                  {uploadImage !== undefined && (
                    <Tabs.Tab disabled={applying} value="upload" className={tabClass}>
                      Upload
                    </Tabs.Tab>
                  )}
                  <Tabs.Tab disabled={applying} value="url" className={tabClass}>
                    Paste from URL
                  </Tabs.Tab>
                  <Tabs.Tab disabled={!source || applying} value="crop" className={tabClass}>
                    Crop
                  </Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="upload" className="grid gap-2">
                  <FieldGroup>
                    <TextInput
                      label="Choose image"
                      error={tab === "upload" ? error : undefined}
                      aria-invalid={(tab === "upload" && error !== undefined) || undefined}
                      id={`${id}-file`}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={(event) => {
                        const picked = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (picked === undefined) return;
                        if (
                          picked.size === 0 ||
                          picked.size > 5 * 1024 * 1024 ||
                          !["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(
                            picked.type,
                          )
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
                </Tabs.Panel>
                <Tabs.Panel value="url" className="grid gap-2">
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
                </Tabs.Panel>
                <Tabs.Panel value="crop" keepMounted className="grid gap-3 data-hidden:hidden">
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
                          <Slider.Root
                            data-slot="slider"
                            min={1}
                            max={20}
                            step={0.05}
                            disabled={!loaded || applying}
                            value={framing.zoom}
                            onValueChange={(zoom) => setDraft({ ...framing, zoom })}
                          >
                            <Slider.Control className="relative flex h-7 w-full touch-none items-center">
                              <Slider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
                                <Slider.Indicator className="absolute h-full bg-primary" />
                              </Slider.Track>
                              <Slider.Thumb
                                aria-labelledby={`${id}-zoom`}
                                className="size-3.5 rounded-full border border-primary bg-background shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                              />
                            </Slider.Control>
                          </Slider.Root>
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
                </Tabs.Panel>
              </Tabs.Root>
              {tab === "crop" && error !== undefined && <FieldError>{error}</FieldError>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                {tab === "crop" && (
                  <Button type="button" disabled={!loaded || applying} onClick={() => void apply()}>
                    {applying ? "Uploading…" : "Apply"}
                  </Button>
                )}
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
        {saveError === undefined ? null : <FieldError id={`${id}-error`}>{saveError}</FieldError>}
      </FieldContent>
    </Field>
  );
}
