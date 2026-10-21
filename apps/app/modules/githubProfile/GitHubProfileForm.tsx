"use client";

import type { IResult } from "@zerospin/error";
import { normalizeGithubProfileInput } from "@qrk.sh/zerospin/src/modules/githubProfile/normalizeGithubProfileInput";

import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { Schema } from "effect";
import type { LibraryApi } from "@qrk.sh/api/modules/LibraryApi.public";
import { useLayoutEffect, useId, useRef, useState } from "react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { githubProfileV1 } from "@qrk.sh/zerospin/src/modules/githubProfile/githubProfileV1";

export function GitHubProfileForm(props: {
  state: IInferDecodedRow<typeof githubProfileV1.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof githubProfileV1.stateShape>,
  ) => IResult<unknown, { message: string }>;
  onCancel: () => void;
}) {
  const { state, onSave, onCancel } = props;
  const inputId = useId();
  const feedbackId = `${inputId}-feedback`;
  const [profileDraft, setProfile] = useState<string | null>(null);
  const profile = profileDraft ?? state?.payload.url ?? "";
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

  const isUsername = /^@?[a-z\d._-]+$/i.test(profile.trim());
  const normalizedUrl = normalizeGithubProfileInput(profile);
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
            const response = await api.getGitHubProfile(normalizedUrl);
            if (submission.signal.aborted) return;
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
            submission.signal.removeEventListener("abort", close);
          }
        } catch (error) {
          if (
            !submission.signal.aborted &&
            !(error instanceof DOMException && error.name === "AbortError")
          ) {
            setSaveError(
              error instanceof Error
                ? error.message
                : "Unable to fetch this GitHub profile; try again.",
            );
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
        GitHub profile URL or username
      </label>
      <Input
        disabled={isSaving}
        aria-describedby={feedbackId}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        id={inputId}
        onChange={(event) => {
          setProfile(event.target.value);
          setSaveError(undefined);
        }}
        placeholder="https://github.com/octocat or octocat"
        spellCheck={false}
        type="text"
        value={profile}
      />
      <p aria-live="polite" className="m-0 break-words" id={feedbackId}>
        {isUsername && normalizedUrl !== undefined
          ? `Profile URL: ${normalizedUrl}`
          : "Enter a GitHub profile URL or a username."}
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
            setProfile(null);
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
