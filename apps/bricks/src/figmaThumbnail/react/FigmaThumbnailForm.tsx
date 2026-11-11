"use client";

import type { IResult } from "@zerospin/error";
import { normalizeFigmaThumbnailInput } from "../definition/normalizeFigmaThumbnailInput";

import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { Schema } from "effect";
import type { LibraryApi } from "../../rpc/LibraryApi";
import { useState } from "react";

import { FieldGroup } from "../../react/field";
import { TextInput } from "../../react/TextInput";
import { useTextCommit } from "../../react/useTextCommit";
import { figmaThumbnailV1 } from "../definition/figmaThumbnailV1";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";

export function FigmaThumbnailForm(props: {
  state: IInferDecodedRow<typeof figmaThumbnailV1.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof figmaThumbnailV1.stateShape>,
  ) => IResult<unknown, { message: string }>;
}) {
  const { state, onSave } = props;
  const [documentUrlDraft, setDocumentUrl] = useState<string | null>(null);
  const documentUrl = documentUrlDraft ?? state?.payload.url ?? "";
  const [validationError, setValidationError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  useWarnBeforeUnload(documentUrl !== (state?.payload.url ?? "") || isSaving);

  const { schedule, onBlur, onKeyDown, onCompositionEnd } = useTextCommit(
    async (draft, signal, explicit) => {
      if (documentUrlDraft === null) return;
      const normalizedUrl = normalizeFigmaThumbnailInput(draft);
      if (normalizedUrl === undefined) {
        if (explicit && (draft.trim() !== "" || state !== null))
          setValidationError("Enter a valid HTTPS Figma document URL.");
        return;
      }
      setValidationError(undefined);
      if (normalizedUrl === state?.payload.url && state.data !== null && saveError === undefined) {
        setDocumentUrl(null);
        return;
      }

      setIsSaving(true);
      setSaveError(undefined);
      try {
        using api = newSyncRpcSession<LibraryApi>("/rpc");
        const close = () => api[Symbol.dispose]();
        signal.addEventListener("abort", close, { once: true });
        try {
          const response = await api.figmaBackend().getThumbnail(normalizedUrl);
          if (signal.aborted) return;
          if (response._tag === "Left") {
            setSaveError(response.left.message);
            return;
          }
          if (normalizeFigmaThumbnailInput(response.right.url) !== normalizedUrl)
            throw new Error("Figma document identity mismatch");
          const nextState = Schema.decodeUnknownSync(
            Schema.toType(
              makeEffectSchema({
                ...figmaThumbnailV1.stateShape,
                data: { ...figmaThumbnailV1.stateShape.data, nullable: false },
              }),
            ),
          )(
            { payload: { url: normalizedUrl }, data: response.right },
            { onExcessProperty: "ignore" },
          );
          const result = onSave(nextState);
          if (result._tag === "Failure") setSaveError(result.failure.message);
          else setDocumentUrl(null);
        } finally {
          signal.removeEventListener("abort", close);
        }
      } catch (error) {
        if (!signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) {
          setSaveError(
            error instanceof Error
              ? error.message
              : "Unable to fetch this Figma document; try again.",
          );
        }
      } finally {
        if (!signal.aborted) setIsSaving(false);
      }
    },
  );

  return (
    <form autoComplete="off" onSubmit={(event) => event.preventDefault()}>
      <FieldGroup>
        <TextInput
          label="Figma document URL"
          description="Paste an HTTPS Figma document URL."
          error={validationError ?? saveError}
          status={isSaving ? "Fetching preview…" : undefined}
          aria-invalid={validationError !== undefined || undefined}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => {
            const value = event.currentTarget.value;
            setDocumentUrl(value);
            setValidationError(undefined);
            setSaveError(undefined);
            setIsSaving(false);
            schedule(event);
          }}
          onCompositionEnd={onCompositionEnd}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder="https://www.figma.com/design/AbCdEfGhIjKlMnOpQrStUv"
          spellCheck={false}
          type="text"
          value={documentUrl}
        />
      </FieldGroup>
    </form>
  );
}
