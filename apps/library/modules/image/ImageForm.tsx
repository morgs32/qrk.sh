"use client";

import type { IResult } from "@zerospin/error";

import { useContext, useId, useLayoutEffect, useRef, useState } from "react";
import { Effect, Schema } from "effect";
import { makeEffectSchema } from "@zerospin/shapes";

import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { ImageUploadRuntimeContext } from "./ImageUploadRuntimeContext";
import { imageV1 } from "./imageV1";
import { ImageUploadEnvironment } from "./ImageUploadEnvironment";

export function ImageForm(props: {
  state: { imageUrl: string; title: string } | null;
  onSave: (state: { imageUrl: string; title: string }) => IResult<unknown, { message: string }>;
  onCancel: () => void;
}) {
  const { state, onSave, onCancel } = props;
  const runtime = useContext(ImageUploadRuntimeContext);
  const initialState = state ?? imageV1.defaultState;
  const [formDraft, setDraft] = useState<{ imageUrl: string; title: string } | null>(null);
  const draft = formDraft ?? initialState;
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const isBusy = isUploadingImage;
  const isDirty = state === null || JSON.stringify(draft) !== JSON.stringify(initialState);
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
    if (runtime === null || isBusy || activeUpload.current !== null) return;
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
    setIsUploadingImage(true);
    try {
      const imageUrl = await runtime.runPromise(
        Effect.gen(function* () {
          const { upload } = yield* ImageUploadEnvironment;
          return yield* upload(file);
        }),
        { signal: controller.signal },
      );
      if (controller.signal.aborted || activeUpload.current !== controller) return;
      setDraft((current) => ({ ...(current ?? initialState), imageUrl }));
    } catch (cause) {
      if (controller.signal.aborted || activeUpload.current !== controller) return;
      setUploadError(cause instanceof Error ? cause.message : "Image upload failed.");
    } finally {
      if (activeUpload.current === controller) {
        activeUpload.current = null;
        setIsUploadingImage(false);
      }
    }
  }

  return (
    <form
      autoComplete="off"
      className="flex w-full flex-col gap-6"
      aria-busy={isBusy}
      onSubmit={(event) => {
        event.preventDefault();
        if (!isDirty || activeUpload.current !== null) return;
        setUploadError(null);
        try {
          const nextState = Schema.decodeUnknownSync(
            Schema.toType(makeEffectSchema(imageV1.stateShape)),
          )(draft);
          const result = onSave(nextState);
          if (result._tag === "Failure") {
            setUploadError(result.failure.message ?? "Brick save was refused");
            return;
          }
          setDraft(null);
        } catch (cause) {
          setUploadError(cause instanceof Error ? cause.message : "Failed to save image");
        }
      }}
    >
      {runtime !== null ? (
        <div className="flex flex-col gap-2">
          <input
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            aria-label="Choose image"
            disabled={isBusy}
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
            disabled={isBusy}
            onClick={() => fileInput.current?.click()}
            onDragEnter={(event) => {
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              event.stopPropagation();
              if (!isBusy) setIsDragging(true);
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
              event.dataTransfer.dropEffect = isBusy ? "none" : "copy";
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
          disabled={isBusy}
          id={`${inputId}-image-url`}
          onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })}
          placeholder="https://example.com/image.jpg"
          spellCheck={false}
          type="url"
          value={draft.imageUrl}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="font-medium" htmlFor={`${inputId}-title`}>
          Title
        </label>
        <Input
          disabled={isBusy}
          id={`${inputId}-title`}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          type="text"
          value={draft.title}
        />
      </div>
      {uploadError !== null ? (
        <p className="m-0" role="alert">
          {uploadError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!isDirty || isBusy}>
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            activeUpload.current?.abort();
            activeUpload.current = null;
            setIsUploadingImage(false);
            setIsDragging(false);
            setUploadError(null);
            setDraft(null);
            onCancel();
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
