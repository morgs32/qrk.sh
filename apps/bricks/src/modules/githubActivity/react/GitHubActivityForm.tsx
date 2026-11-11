"use client";

import type { IResult } from "@zerospin/error";
import { normalizeGithubActivityInput } from "../definition/normalizeGithubActivityInput";

import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { Schema } from "effect";
import type { BricksApi } from "@qrk.sh/bricks/rpc";
import { useState } from "react";

import { FieldGroup } from "../../../components/field";
import { TextInput } from "../../../components/TextInput";
import { useTextCommit } from "../../react/useTextCommit";
import { githubActivityV1 } from "../definition/githubActivityV1";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";

export function GitHubActivityForm(props: {
  state: IInferDecodedRow<typeof githubActivityV1.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof githubActivityV1.stateShape>,
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
      const normalizedUrl = normalizeGithubActivityInput(draft);
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
        using api = newSyncRpcSession<BricksApi>("/rpc");
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
                ...githubActivityV1.stateShape,
                data: { ...githubActivityV1.stateShape.data, nullable: false },
              }),
            ),
          )(
            { payload: { url: normalizedUrl }, data: response.right },
            { onExcessProperty: "ignore" },
          );
          if (
            nextState.data.contributions.some(
              (day) =>
                !Number.isFinite(Date.parse(day.date)) ||
                new Date(day.date).toISOString().slice(0, 10) !== day.date,
            )
          )
            throw new Error("Invalid contribution date");
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
              : "Unable to fetch this GitHub activity; try again.",
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
          orientation="vertical"
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
