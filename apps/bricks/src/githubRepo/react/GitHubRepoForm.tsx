"use client";

import type { IResult } from "@zerospin/error";
import { normalizeGithubRepoInput } from "../definition/normalizeGithubRepoInput";

import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { Schema } from "effect";
import type { LibraryApi } from "../../rpc/LibraryApi";
import { useState } from "react";

import { FieldGroup } from "../../react/field";
import { TextInput } from "../../react/TextInput";
import { useTextCommit } from "../../react/useTextCommit";
import { githubRepoV1 } from "../definition/githubRepoV1";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";

export function GitHubRepoForm(props: {
  state: IInferDecodedRow<typeof githubRepoV1.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof githubRepoV1.stateShape>,
  ) => IResult<unknown, { message: string }>;
}) {
  const { state, onSave } = props;
  const [repositoryDraft, setRepository] = useState<string | null>(null);
  const repository = repositoryDraft ?? state?.payload.url ?? "";
  const [validationError, setValidationError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  useWarnBeforeUnload(repository !== (state?.payload.url ?? "") || isSaving);

  const { schedule, onBlur, onKeyDown, onCompositionEnd } = useTextCommit(
    async (draft, signal, explicit) => {
      if (repositoryDraft === null) return;
      const normalizedUrl = normalizeGithubRepoInput(draft);
      if (normalizedUrl === undefined) {
        if (explicit && (draft.trim() !== "" || state !== null))
          setValidationError("Enter a valid GitHub repository.");
        return;
      }
      setValidationError(undefined);
      if (normalizedUrl === state?.payload.url && state.data !== null && saveError === undefined) {
        setRepository(null);
        return;
      }

      setIsSaving(true);
      setSaveError(undefined);
      try {
        using api = newSyncRpcSession<LibraryApi>("/rpc");
        const close = () => api[Symbol.dispose]();
        signal.addEventListener("abort", close, { once: true });
        try {
          const response = await api.getGitHubRepo(normalizedUrl);
          if (signal.aborted) return;
          if (response._tag === "Left") {
            setSaveError(response.left.message);
            return;
          }
          const nextState = Schema.decodeUnknownSync(
            Schema.toType(
              makeEffectSchema({
                ...githubRepoV1.stateShape,
                data: { ...githubRepoV1.stateShape.data, nullable: false },
              }),
            ),
          )(
            { payload: { url: normalizedUrl }, data: response.right },
            { onExcessProperty: "ignore" },
          );
          const result = onSave(nextState);
          if (result._tag === "Failure") setSaveError(result.failure.message);
          else setRepository(null);
        } finally {
          signal.removeEventListener("abort", close);
        }
      } catch (error) {
        if (!signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) {
          setSaveError(
            error instanceof Error
              ? error.message
              : "Unable to fetch this GitHub repository; try again.",
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
          label="GitHub repository URL"
          description="Enter owner/repository or a GitHub repository URL."
          error={validationError ?? saveError}
          status={isSaving ? "Fetching preview…" : undefined}
          aria-invalid={validationError !== undefined || undefined}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => {
            const value = event.currentTarget.value;
            setRepository(value);
            setValidationError(undefined);
            setSaveError(undefined);
            setIsSaving(false);
            schedule(event);
          }}
          onCompositionEnd={onCompositionEnd}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder="https://github.com/morgs32/qrk.sh"
          spellCheck={false}
          type="text"
          value={repository}
        />
      </FieldGroup>
    </form>
  );
}
