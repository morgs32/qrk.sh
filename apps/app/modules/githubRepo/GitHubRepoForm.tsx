"use client";

import type { IResult } from "@zerospin/error";
import { normalizeGithubRepoInput } from "@qrk.sh/zerospin/src/modules/githubRepo/normalizeGithubRepoInput";

import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { Schema } from "effect";
import type { LibraryApi } from "@qrk.sh/api/modules/LibraryApi.public";
import { useLayoutEffect, useId, useRef, useState } from "react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { githubRepoV2 } from "@qrk.sh/zerospin/src/modules/githubRepo/githubRepoV2";

export function GitHubRepoForm(props: {
  state: IInferDecodedRow<typeof githubRepoV2.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof githubRepoV2.stateShape>,
  ) => IResult<unknown, { message: string }>;
  onCancel: () => void;
}) {
  const { state, onSave, onCancel } = props;
  const inputId = useId();
  const feedbackId = `${inputId}-feedback`;
  const [repositoryDraft, setRepository] = useState<string | null>(null);
  const repository = repositoryDraft ?? state?.payload.url ?? "";
  const [saveError, setSaveError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const activeSubmission = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    return () => {
      const submission = activeSubmission.current;
      activeSubmission.current = null;
      submission?.abort();
    };
  }, []);

  const normalizedUrl = normalizeGithubRepoInput(repository);
  const canSave =
    normalizedUrl !== undefined &&
    (normalizedUrl !== state?.payload.url || state?.data === null || saveError !== undefined);

  return (
    <form
      autoComplete="off"
      className="mx-auto flex max-w-md flex-col gap-2 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSave || normalizedUrl === undefined || activeSubmission.current !== null) return;
        const submission = new AbortController();
        activeSubmission.current = submission;
        setIsSaving(true);
        setSaveError(undefined);
        try {
          using api = newSyncRpcSession<LibraryApi>("/rpc");
          const close = () => api[Symbol.dispose]();
          submission.signal.addEventListener("abort", close, { once: true });
          try {
            const response = await api.getGitHubRepo(normalizedUrl);
            if (submission.signal.aborted) return;
            if (response._tag === "Left") {
              setSaveError(response.left.message);
              return;
            }
            const nextState = Schema.decodeUnknownSync(
              Schema.toType(
                makeEffectSchema({
                  ...githubRepoV2.stateShape,
                  data: { ...githubRepoV2.stateShape.data, nullable: false },
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
            submission.signal.removeEventListener("abort", close);
          }
        } catch (error) {
          if (
            !submission.signal.aborted &&
            !(error instanceof DOMException && error.name === "AbortError")
          ) {
            setSaveError(error instanceof Error ? error.message : "Unable to fetch this GitHub repository; try again.");
          }
        } finally {
          if (activeSubmission.current === submission) {
            activeSubmission.current = null;
            setIsSaving(false);
          }
        }
      }}
    >
      <label className="font-medium" htmlFor={inputId}>
        GitHub repository URL
      </label>
      <Input
        disabled={isSaving}
        aria-describedby={feedbackId}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        id={inputId}
        onChange={(event) => {
          setRepository(event.target.value);
          setSaveError(undefined);
        }}
        placeholder="https://github.com/morgs32/qrk.sh"
        spellCheck={false}
        type="text"
        value={repository}
      />
      <p aria-live="polite" className="m-0 break-words" id={feedbackId}>
        {normalizedUrl !== undefined
          ? `Repository URL: ${normalizedUrl}`
          : "Enter a GitHub repository URL."}
      </p>
      {isSaving ? <p role="status">Fetching…</p> : null}
      {saveError !== undefined ? (
        <p className="m-0 break-words" role="alert">
          {saveError}
        </p>
      ) : null}
      <div className="flex self-end gap-2">
        <Button
          onClick={() => {
            const submission = activeSubmission.current;
            activeSubmission.current = null;
            submission?.abort();
            setIsSaving(false);
            setRepository(null);
            setSaveError(undefined);
            onCancel();
          }}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button disabled={!canSave || isSaving} type="submit">
          Save
        </Button>
      </div>
    </form>
  );
}
