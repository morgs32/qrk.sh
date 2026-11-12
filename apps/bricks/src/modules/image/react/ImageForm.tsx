"use client";

import type { IResult } from "@zerospin/error";
import { Schema } from "effect";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { Checkbox } from "../../../components/checkbox";
import { Field, FieldGroup, FieldLabel } from "../../../components/field";
import { ImageUploadInput } from "../../../components/ImageUploadInput";
import { TextInput } from "../../../components/TextInput";
import { useTextCommit } from "../../react/useTextCommit";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";
import { completeImageStateSchemaV4, imageStateSchemaV4, imageV4 } from "../definition/imageV4";
import type {} from "./ImageUploadSWR";

const isCompleteImage = Schema.is(Schema.toType(completeImageStateSchemaV4));
const blankImage = { imageUrl: "", altText: "", caption: "", crop: null, round: false };

export function ImageForm(props: {
  state: typeof imageStateSchemaV4.Type | null;
  onSave: (state: typeof imageStateSchemaV4.Type) => IResult<unknown, { message: string }>;
  onDraftChange?: (draft: { state: unknown; pending: boolean; valid: boolean }) => void;
  previewWidth?: number;
  measureFrame?: (selector: string) => number | undefined;
}) {
  const { state, onSave, onDraftChange, previewWidth, measureFrame } = props;
  const { uploadImage } = useSWRConfig();
  const roundId = useId();
  const working = useRef(state ?? blankImage);
  const [draft, setDraft] = useState(state ?? blankImage);
  const [error, setError] = useState<string>();
  const [uploadPending, setUploadPending] = useState(false);
  const uploadPendingRef = useRef(false);
  const saveFailed = useRef(false);
  const isEditing = useRef(false);
  const { defaultWidth, defaultHeight, minWidth } = imageV4.variants.default;

  useLayoutEffect(() => {
    if (!isEditing.current) {
      working.current = state ?? blankImage;
      setDraft(state ?? blankImage);
    }
  }, [state]);
  useWarnBeforeUnload(isEditing.current || uploadPending);

  function save(next: typeof imageStateSchemaV4.Type) {
    working.current = next;
    setDraft(next);
    const valid = isCompleteImage(next);
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
        getFrameAspectRatio={() => {
          if (working.current.round) return 1;
          const frame = measureFrame?.("[data-image-cover]");
          return frame ??
            Math.max(minWidth, Math.min(defaultWidth, previewWidth ?? defaultWidth)) /
              (defaultHeight === null ? 200 : defaultHeight - 56);
        }}
        onPendingChange={(pending) => {
          uploadPendingRef.current = pending;
          setUploadPending(pending);
          onDraftChange?.({ state: working.current, pending: pending || isEditing.current, valid: !saveFailed.current && isCompleteImage(working.current) });
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
          onDraftChange?.({ state: next, pending: true, valid: isCompleteImage(next) });
          altCommit.schedule(event);
        }}
        onBlur={altCommit.onBlur}
        onKeyDown={altCommit.onKeyDown}
        onCompositionEnd={altCommit.onCompositionEnd}
      />
      <TextInput
        label="Caption"
        disabled={draft.round}
        value={draft.caption}
        onChange={(event) => {
          const next = { ...working.current, caption: event.currentTarget.value };
          working.current = next;
          setDraft(next);
          isEditing.current = true;
          onDraftChange?.({ state: next, pending: true, valid: isCompleteImage(next) });
          captionCommit.schedule(event);
        }}
        onBlur={captionCommit.onBlur}
        onKeyDown={captionCommit.onKeyDown}
        onCompositionEnd={captionCommit.onCompositionEnd}
      />
      <Field orientation="horizontal">
        <FieldLabel id={`${roundId}-label`} htmlFor={roundId}>Round</FieldLabel>
        <Checkbox
          id={roundId}
          aria-labelledby={`${roundId}-label`}
          checked={draft.round}
          disabled={draft.caption.trim() !== ""}
          onCheckedChange={(round) => save({ ...working.current, round })}
        />
      </Field>
    </FieldGroup>
  );
}
