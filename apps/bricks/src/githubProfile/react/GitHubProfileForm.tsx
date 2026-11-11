"use client";

import type { IResult } from "@zerospin/error";
import { normalizeGithubProfileInput } from "../definition/normalizeGithubProfileInput";

import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { Schema } from "effect";
import type { LibraryApi } from "../../rpc/LibraryApi";
import { useState } from "react";

import { FieldGroup } from "../../react/field";
import { TextInput } from "../../react/TextInput";
import { useTextCommit } from "../../react/useTextCommit";
import { githubProfileV1 } from "../definition/githubProfileV1";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";

export function GitHubProfileForm(props: {
  state: IInferDecodedRow<typeof githubProfileV1.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof githubProfileV1.stateShape>,
  ) => IResult<unknown, { message: string }>;
}) {
  const { state, onSave } = props;
  const [profileDraft, setProfile] = useState<string | null>(null);
  const profile = profileDraft ?? state?.payload.url ?? "";
  const [validationError, setValidationError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  useWarnBeforeUnload(profile !== (state?.payload.url ?? "") || isSaving);

  const { schedule, onBlur, onKeyDown, onCompositionEnd } = useTextCommit(
    async (draft, signal, explicit) => {
      if (profileDraft === null) return;
      const normalizedUrl = normalizeGithubProfileInput(draft);
      if (normalizedUrl === undefined) {
        if (explicit && (draft.trim() !== "" || state !== null))
          setValidationError("Enter a valid GitHub username or profile URL.");
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
        using api = newSyncRpcSession<LibraryApi>("/rpc");
        const close = () => api[Symbol.dispose]();
        signal.addEventListener("abort", close, { once: true });
        try {
          const response = await api.getGitHubProfile(normalizedUrl);
          if (signal.aborted) return;
          if (response._tag === "Left") {
            setSaveError(response.left.message);
            return;
          }
          if (
            response.right.login.toLowerCase() !==
            new URL(normalizedUrl).pathname.slice(1).toLowerCase()
          )
            throw new Error("GitHub profile identity mismatch");
          const nextState = Schema.decodeUnknownSync(
            Schema.toType(
              makeEffectSchema({
                ...githubProfileV1.stateShape,
                data: { ...githubProfileV1.stateShape.data, nullable: false },
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
              : "Unable to fetch this GitHub profile; try again.",
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
          label="GitHub profile URL or username"
          description="Enter a GitHub username or profile URL."
          error={validationError ?? saveError}
          status={isSaving ? "Fetching preview…" : undefined}
          aria-invalid={validationError !== undefined || undefined}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => {
            const value = event.currentTarget.value;
            setProfile(value);
            setValidationError(undefined);
            setSaveError(undefined);
            setIsSaving(false);
            schedule(event);
          }}
          onCompositionEnd={onCompositionEnd}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder="https://github.com/octocat or octocat"
          spellCheck={false}
          type="text"
          value={profile}
        />
      </FieldGroup>
    </form>
  );
}
