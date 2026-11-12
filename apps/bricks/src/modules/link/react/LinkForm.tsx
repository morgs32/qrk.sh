"use client";

import type { IResult } from "@zerospin/error";
import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { Schema } from "effect";
import { useState } from "react";

import { FieldGroup } from "../../../components/field";
import { TextInput } from "../../../components/TextInput";
import { useTextCommit } from "../../react/useTextCommit";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";
import type { ILinkPreview, IRpcEither } from "../../../rpc/types";
import { linkV1 } from "../definition/linkV1";
import { normalizeLinkInput } from "../definition/normalizeLinkInput";

export function LinkForm(props: {
  state: IInferDecodedRow<typeof linkV1.stateShape> | null;
  onDraftChange?: ((draft: { state: unknown; pending: boolean; valid: boolean }) => void) | undefined;
  onSave: (
    state: IInferDecodedRow<typeof linkV1.stateShape>,
  ) => IResult<unknown, { message: string }>;
  lookupLinkPreview: (url: string, signal: AbortSignal) => Promise<IRpcEither<ILinkPreview>>;
}) {
  const { state, onSave, lookupLinkPreview, onDraftChange } = props;
  const [urlDraft, setUrl] = useState<string | null>(null);
  const url = urlDraft ?? state?.payload.url ?? "";
  const [validationError, setValidationError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  useWarnBeforeUnload(url !== (state?.payload.url ?? "") || isSaving);

  const { schedule, onBlur, onKeyDown, onCompositionEnd } = useTextCommit(
    async (draft, signal, explicit) => {
      if (urlDraft === null) return;
      const normalizedUrl = normalizeLinkInput(draft);
      if (normalizedUrl === undefined) {
        onDraftChange?.({ state, pending: false, valid: false });
        if (explicit && (draft.trim() !== "" || state !== null))
          setValidationError("Enter a valid HTTP or HTTPS URL.");
        return;
      }
      setValidationError(undefined);
      if (normalizedUrl === state?.payload.url && state.data !== null && saveError === undefined) {
        setUrl(null);
        onDraftChange?.({ state, pending: false, valid: true });
        return;
      }

      setIsSaving(true);
      setSaveError(undefined);
      try {
        const response = await lookupLinkPreview(normalizedUrl, signal);
        if (signal.aborted) return;
        if (response._tag === "Left") {
          onDraftChange?.({ state, pending: false, valid: false });
          setSaveError(response.left.message);
          return;
        }
        const nextState = Schema.decodeUnknownSync(
          Schema.toType(
            makeEffectSchema({
              ...linkV1.stateShape,
              data: { ...linkV1.stateShape.data, nullable: false },
            }),
          ),
        )(
          { payload: { url: response.right.url }, data: response.right },
          { onExcessProperty: "ignore" },
        );
        const result = onSave(nextState);
        if (result._tag === "Failure") setSaveError(result.failure.message);
        else setUrl(null);
      } catch (error) {
        if (!signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) {
          onDraftChange?.({ state, pending: false, valid: false });
          setSaveError(
            error instanceof Error
              ? error.message
              : "Unable to fetch this link preview; try again.",
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
          label="Link URL"
          orientation="vertical"
          description="Enter an HTTP or HTTPS URL."
          error={validationError ?? saveError}
          status={isSaving ? "Fetching preview…" : undefined}
          aria-invalid={validationError !== undefined || undefined}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => {
            const value = event.currentTarget.value;
            onDraftChange?.({ state, pending: true, valid: false });
            setUrl(value);
            setValidationError(undefined);
            setSaveError(undefined);
            setIsSaving(false);
            schedule(event);
          }}
          onCompositionEnd={onCompositionEnd}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder="https://example.com"
          spellCheck={false}
          type="url"
          value={url}
        />
      </FieldGroup>
    </form>
  );
}
