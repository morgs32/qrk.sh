"use client";

import type { IResult } from "@zerospin/error";
import { normalizeInstagramInput } from "../definition/normalizeInstagramInput";

import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { Schema } from "effect";
import type { BricksApi } from "@qrk.sh/bricks/rpc";
import { useEffect, useState } from "react";

import { FieldGroup } from "../../../components/field";
import { TextInput } from "../../../components/TextInput";
import { useTextCommit } from "../../react/useTextCommit";
import { instagramV1 } from "../definition/instagramV1";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";

export function InstagramForm(props: {
  state: IInferDecodedRow<typeof instagramV1.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof instagramV1.stateShape>,
  ) => IResult<unknown, { message: string }>;
  onDraftChange?: (draft: { state: unknown; pending: boolean; valid: boolean }) => void;
}) {
  const { state, onSave, onDraftChange } = props;
  const [profileDraft, setProfile] = useState<string | null>(null);
  const profile = profileDraft ?? state?.payload.url ?? "";
  const [validationError, setValidationError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => {
    onDraftChange?.({
      state,
      pending: isSaving,
      valid:
        profileDraft === null && state !== null && state.data !== null && saveError === undefined,
    });
  }, [onDraftChange, state, profileDraft, isSaving, saveError]);
  useWarnBeforeUnload(profile !== (state?.payload.url ?? "") || isSaving);

  const { schedule, onBlur, onKeyDown, onCompositionEnd } = useTextCommit(
    async (draft, signal, explicit) => {
      if (profileDraft === null) return;
      const normalizedUrl = normalizeInstagramInput(draft);
      if (normalizedUrl === undefined) {
        if (explicit && (draft.trim() !== "" || state !== null))
          setValidationError("Enter a valid Instagram username or profile URL.");
        return;
      }
      setValidationError(undefined);
      if (normalizedUrl === state?.payload.url && state.data !== null && saveError === undefined) {
        setProfile(null);
        return;
      }

      setIsSaving(true);
      setSaveError(undefined);
      try {
        using api = newSyncRpcSession<BricksApi>("/rpc");
        const close = () => api[Symbol.dispose]();
        signal.addEventListener("abort", close, { once: true });
        try {
          const response = await api.getInstagramProfile(normalizedUrl);
          if (signal.aborted) return;
          if (response._tag === "Left") {
            setSaveError(response.left.message);
            return;
          }
          if (
            response.right.username.toLowerCase() !==
            new URL(normalizedUrl).pathname.slice(1).toLowerCase()
          )
            throw new Error("Instagram profile identity mismatch");
          const nextState = Schema.decodeUnknownSync(
            Schema.toType(
              makeEffectSchema({
                ...instagramV1.stateShape,
                data: { ...instagramV1.stateShape.data, nullable: false },
              }),
            ),
          )(
            { payload: { url: normalizedUrl }, data: response.right },
            { onExcessProperty: "ignore" },
          );
          const result = onSave(nextState);
          if (result._tag === "Failure") setSaveError(result.failure.message);
          else setProfile(null);
        } finally {
          signal.removeEventListener("abort", close);
        }
      } catch (error) {
        if (!signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) {
          setSaveError(
            error instanceof Error
              ? error.message
              : "Unable to fetch this Instagram profile; try again.",
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
          label="Instagram profile URL or username"
          orientation="vertical"
          description="Enter an Instagram username or profile URL."
          error={validationError ?? saveError}
          status={isSaving ? "Fetching preview…" : undefined}
          aria-invalid={validationError !== undefined || undefined}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => {
            const value = event.currentTarget.value;
            onDraftChange?.({ state, pending: true, valid: false });
            setProfile(value);
            setValidationError(undefined);
            setSaveError(undefined);
            setIsSaving(false);
            schedule(event);
          }}
          onCompositionEnd={onCompositionEnd}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder="https://www.instagram.com/theonion or theonion"
          spellCheck={false}
          type="text"
          value={profile}
        />
      </FieldGroup>
    </form>
  );
}
