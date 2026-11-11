"use client";

import type { IResult } from "@zerospin/error";
import { Schema } from "effect";
import { useId, useState } from "react";
import { useSWRConfig } from "swr";

import { Button } from "../../react/button";
import { ImageUploadInput } from "../../react/ImageUploadInput";
import { Input } from "../../react/Input";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";
import { imageStateSchema, imageV2 } from "../definition/imageV2";
import type {} from "./ImageUploadSWR";

export function ImageForm(props: {
  state: typeof imageStateSchema.Type | null;
  onSave: (state: typeof imageStateSchema.Type) => IResult<unknown, { message: string }>;
  onCancel: () => void;
  previewWidth?: number;
  measureFrame?: (selector: string) => number | undefined;
}) {
  const { state, onSave, onCancel, previewWidth, measureFrame } = props;
  const { uploadImage } = useSWRConfig();
  const initialState = state ?? { imageUrl: "", title: "", crop: null };
  const [formDraft, setDraft] = useState<typeof imageStateSchema.Type | null>(null);
  const [error, setError] = useState<string>();
  const draft = formDraft ?? initialState;
  const hasUnsavedChanges = JSON.stringify(draft) !== JSON.stringify(initialState);
  const isDirty = state === null || hasUnsavedChanges;
  const id = useId();
  const { defaultWidth, defaultHeight, minWidth } = imageV2.variants.default;

  useWarnBeforeUnload(hasUnsavedChanges);

  return (
    <form
      autoComplete="off"
      className="flex w-full flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!isDirty) return;
        setError(undefined);
        try {
          const result = onSave(Schema.decodeUnknownSync(imageStateSchema)(draft));
          if (result._tag === "Failure") {
            setError(result.failure.message ?? "Brick save was refused");
            return;
          }
          setDraft(null);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Failed to save image");
        }
      }}
    >
      <ImageUploadInput
        label="Edit"
        imageUrl={draft.imageUrl}
        crop={draft.crop}
        uploadImage={uploadImage}
        getFrameAspectRatio={() =>
          measureFrame?.("[data-image-cover]") ??
          Math.max(minWidth, Math.min(defaultWidth, previewWidth ?? defaultWidth)) /
            (defaultHeight === null ? 200 : defaultHeight - 56)
        }
        onApply={(source) => setDraft((current) => ({ ...(current ?? initialState), ...source }))}
      />
      <div className="flex flex-col gap-2">
        <label className="form-input-label" htmlFor={`${id}-title`}>
          Title
        </label>
        <Input
          id={`${id}-title`}
          type="text"
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
      </div>
      {error !== undefined && (
        <p className="m-0" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!isDirty}>
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setError(undefined);
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
