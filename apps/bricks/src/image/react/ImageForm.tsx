"use client";

import type { IResult } from "@zerospin/error";
import { Schema } from "effect";
import { useLayoutEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { FieldGroup } from "../../react/field";
import { ImageUploadInput } from "../../react/ImageUploadInput";
import { TextInput } from "../../react/TextInput";
import { useTextCommit } from "../../react/useTextCommit";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";
import { imageStateSchema, imageV2 } from "../definition/imageV2";
import type {} from "./ImageUploadSWR";

const blankImage = { imageUrl: "", title: "", crop: null };

export function ImageForm(props: {
  state: typeof imageStateSchema.Type | null;
  onSave: (state: typeof imageStateSchema.Type) => IResult<unknown, { message: string }>;
  previewWidth?: number;
  measureFrame?: (selector: string) => number | undefined;
}) {
  const { state, onSave, previewWidth, measureFrame } = props;
  const { uploadImage } = useSWRConfig();
  const accepted = useRef(state ?? blankImage);
  useLayoutEffect(() => {
    accepted.current = state ?? blankImage;
  }, [state]);

  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [imageDraft, setImageDraft] = useState<{
    imageUrl: string;
    crop: typeof imageStateSchema.Type.crop;
  } | null>(null);
  const [titleError, setTitleError] = useState<string>();
  const [imageError, setImageError] = useState<string>();
  const title = titleDraft ?? state?.title ?? "";
  const { imageUrl, crop } = imageDraft ?? state ?? blankImage;
  const { defaultWidth, defaultHeight, minWidth } = imageV2.variants.default;

  useWarnBeforeUnload(title !== (state?.title ?? "") || imageDraft !== null);

  function save(next: typeof imageStateSchema.Type) {
    try {
      const decoded = Schema.decodeUnknownSync(imageStateSchema)(next);
      const result = onSave(decoded);
      if (result._tag === "Failure") return result.failure.message ?? "Brick save was refused";
      accepted.current = decoded;
    } catch (cause) {
      return cause instanceof Error ? cause.message : "Failed to save image";
    }
  }

  const { schedule, onBlur, onKeyDown, onCompositionEnd } = useTextCommit((value) => {
    if (value === accepted.current.title) {
      setTitleDraft(null);
      setTitleError(undefined);
      return;
    }
    const error = save({ ...accepted.current, title: value });
    setTitleError(error);
    if (error === undefined) setTitleDraft(null);
  });

  return (
    <FieldGroup>
      <ImageUploadInput
        label="Edit"
        saveError={imageError}
        imageUrl={imageUrl}
        crop={crop}
        uploadImage={uploadImage}
        getFrameAspectRatio={() =>
          measureFrame?.("[data-image-cover]") ??
          Math.max(minWidth, Math.min(defaultWidth, previewWidth ?? defaultWidth)) /
            (defaultHeight === null ? 200 : defaultHeight - 56)
        }
        onApply={(source) => {
          const error = save({ ...accepted.current, ...source });
          setImageError(error);
          setImageDraft(error === undefined ? null : source);
        }}
      />
      <TextInput
        label="Title"
        type="text"
        value={title}
        error={titleError}
        onChange={(event) => {
          setTitleDraft(event.currentTarget.value);
          setTitleError(undefined);
          schedule(event);
        }}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onCompositionEnd={onCompositionEnd}
      />
    </FieldGroup>
  );
}
