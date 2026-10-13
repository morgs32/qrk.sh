"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";

import { Input } from "../../components/ui/input";

export function ImageForm(props: {
  state: { imageUrl: string; title: string };
  onChange: (state: { imageUrl: string; title: string }) => void;
  uploadImage?: (props: { file: File; signal: AbortSignal }) => Promise<string>;
  isUploadingImage?: boolean;
}) {
  const { state, onChange, uploadImage, isUploadingImage = false } = props;
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const activeUpload = useRef<AbortController | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useLayoutEffect(() => {
    return () => {
      activeUpload.current?.abort();
      activeUpload.current = null;
    };
  }, []);

  async function uploadFiles(files: File[]) {
    if (uploadImage === undefined || isUploadingImage || activeUpload.current !== null) return;
    setUploadError(null);
    if (files.length !== 1) {
      setUploadError("Choose one image at a time.");
      return;
    }
    const file = files[0];
    if (file.size === 0) {
      setUploadError("The selected image is empty.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("The selected image exceeds the 5 MiB limit.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
      setUploadError("Choose a PNG, JPEG, WebP, or SVG image.");
      return;
    }

    const controller = new AbortController();
    activeUpload.current = controller;
    try {
      const imageUrl = await uploadImage({ file, signal: controller.signal });
      if (controller.signal.aborted || activeUpload.current !== controller) return;
      onChange({ ...state, imageUrl });
    } catch (cause) {
      if (controller.signal.aborted || activeUpload.current !== controller) return;
      setUploadError(cause instanceof Error ? cause.message : "Image upload failed.");
    } finally {
      if (activeUpload.current === controller) activeUpload.current = null;
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {uploadImage !== undefined ? (
        <div className="flex flex-col gap-2">
          <input
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            aria-label="Choose image"
            disabled={isUploadingImage}
            hidden
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (files.length > 0) void uploadFiles(files);
            }}
            ref={fileInput}
            type="file"
          />
          <button
            aria-describedby={`${inputId}-upload-help`}
            className={`flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60 ${isDragging ? "border-primary bg-muted" : "border-input hover:bg-muted/50"}`}
            disabled={isUploadingImage}
            onClick={() => fileInput.current?.click()}
            onDragEnter={(event) => {
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              event.stopPropagation();
              if (!isUploadingImage) setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.stopPropagation();
              if (
                !event.currentTarget.contains(
                  event.relatedTarget instanceof Node ? event.relatedTarget : null,
                )
              ) {
                setIsDragging(false);
              }
            }}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = isUploadingImage ? "none" : "copy";
            }}
            onDrop={(event) => {
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              event.stopPropagation();
              setIsDragging(false);
              void uploadFiles(Array.from(event.dataTransfer.files));
            }}
            type="button"
          >
            <span className="font-medium">
              {isUploadingImage ? "Uploading image…" : "Drop an image here or click to choose"}
            </span>
          </button>
          <small className="m-0" id={`${inputId}-upload-help`}>
            PNG, JPEG, WebP, or SVG · up to 5 MiB
          </small>
          {isUploadingImage ? (
            <p className="m-0" role="status">
              Uploading image…
            </p>
          ) : null}
          {uploadError !== null ? (
            <p className="m-0" role="alert">
              {uploadError}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <label className="font-medium" htmlFor={`${inputId}-image-url`}>
          Image URL
        </label>
        <Input
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          disabled={isUploadingImage}
          id={`${inputId}-image-url`}
          onChange={(event) => onChange({ ...state, imageUrl: event.target.value })}
          placeholder="https://example.com/image.jpg"
          spellCheck={false}
          type="url"
          value={state.imageUrl}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="font-medium" htmlFor={`${inputId}-title`}>
          Title
        </label>
        <Input
          disabled={isUploadingImage}
          id={`${inputId}-title`}
          onChange={(event) => onChange({ ...state, title: event.target.value })}
          type="text"
          value={state.title}
        />
      </div>
    </div>
  );
}
