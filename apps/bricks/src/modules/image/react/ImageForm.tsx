"use client";

import type { IResult } from "@zerospin/error";
import { Schema } from "effect";
import { useLayoutEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { FieldGroup } from "../../../components/field";
import { ImageUploadInput } from "../../../components/ImageUploadInput";
import { TextInput } from "../../../components/TextInput";
import { useTextCommit } from "../../react/useTextCommit";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";
import { completeImageStateSchema, imageStateSchemaV3, imageV3 } from "../definition/imageV3";
import type {} from "./ImageUploadSWR";

const blankImage = { imageUrl: "", altText: "", caption: "", crop: null };

export function ImageForm(props: {
  state: typeof imageStateSchemaV3.Type | null;
  onSave: (state: typeof imageStateSchemaV3.Type) => IResult<unknown, { message: string }>;
  onDraftChange?: (draft: { state: unknown; pending: boolean; valid: boolean }) => void;
  previewWidth?: number;
  measureFrame?: (selector: string) => number | undefined;
}) {
  const { state, onSave, onDraftChange, previewWidth, measureFrame } = props;
  const { uploadImage } = useSWRConfig();
  const working = useRef(state ?? blankImage);
  const [draft, setDraft] = useState(state ?? blankImage);
  const [error, setError] = useState<string>();
  const [uploadPending, setUploadPending] = useState(false);
  const uploadPendingRef = useRef(false);
  const saveFailed = useRef(false);
  const isEditing = useRef(false);
  const { defaultWidth, defaultHeight, minWidth } = imageV3.variants.default;

  useLayoutEffect(() => {
    if (!isEditing.current) {
      working.current = state ?? blankImage;
      setDraft(state ?? blankImage);
    }
  }, [state]);
  useWarnBeforeUnload(isEditing.current || uploadPending);

  function save(next: typeof imageStateSchemaV3.Type) {
    working.current = next;
    setDraft(next);
    const valid = Schema.is(completeImageStateSchema)(next);
    if (!valid) {
      isEditing.current = true;
      saveFailed.current = false;
      setError(undefined);
      onDraftChange?.({ state: next, pending: uploadPendingRef.current, valid: false });
      return;
    }
    const result = onSave(next);
    saveFailed.current = result._tag === "Failure";
    isEditing.current = saveFailed.current;
    setError(result._tag === "Failure" ? result.failure.message ?? "Brick save was refused" : undefined);
    onDraftChange?.({ state: next, pending: uploadPendingRef.current, valid: !saveFailed.current });
  }

  const altCommit = useTextCommit((value) => save({ ...working.current, altText: value }));
  const captionCommit = useTextCommit((value) => save({ ...working.current, caption: value }));

  return (
    <FieldGroup>
      <ImageUploadInput
        label="Image"
        saveError={error}
        imageUrl={draft.imageUrl}
        crop={draft.crop}
        uploadImage={uploadImage}
        getFrameAspectRatio={() =>
          measureFrame?.("[data-image-cover]") ??
          Math.max(minWidth, Math.min(defaultWidth, previewWidth ?? defaultWidth)) /
            (defaultHeight === null ? 200 : defaultHeight - 56)
        }
        onPendingChange={(pending) => {
          uploadPendingRef.current = pending;
          setUploadPending(pending);
          onDraftChange?.({ state: working.current, pending: pending || isEditing.current, valid: !saveFailed.current && Schema.is(completeImageStateSchema)(working.current) });
        }}
        onApply={(source) => save({ ...working.current, ...source })}
      />
      <TextInput
        label="Alt text"
        value={draft.altText}
        onChange={(event) => {
          const next = { ...working.current, altText: event.currentTarget.value };
          working.current = next;
          setDraft(next);
          isEditing.current = true;
          onDraftChange?.({ state: next, pending: true, valid: Schema.is(completeImageStateSchema)(next) });
          altCommit.schedule(event);
        }}
        onBlur={altCommit.onBlur}
        onKeyDown={altCommit.onKeyDown}
        onCompositionEnd={altCommit.onCompositionEnd}
      />
      <TextInput
        label="Caption"
        value={draft.caption}
        onChange={(event) => {
          const next = { ...working.current, caption: event.currentTarget.value };
          working.current = next;
          setDraft(next);
          isEditing.current = true;
          onDraftChange?.({ state: next, pending: true, valid: Schema.is(completeImageStateSchema)(next) });
          captionCommit.schedule(event);
        }}
        onBlur={captionCommit.onBlur}
        onKeyDown={captionCommit.onKeyDown}
        onCompositionEnd={captionCommit.onCompositionEnd}
      />
    </FieldGroup>
  );
}
