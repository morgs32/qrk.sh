"use client";

import type { IResult } from "@zerospin/error";
import { normalizeGithubProfileInput } from "./normalizeGithubProfileInput";

import { type IInferDecodedRow } from "@zerospin/shapes";
import { useId, useState } from "react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { githubProfileV1 } from "./githubProfileV1";

export function GitHubProfileForm(props: {
  state: IInferDecodedRow<typeof githubProfileV1.stateShape> | null;
  onConfigure: (input: { url: string }) => IResult<unknown, { message: string }>;
  onCancel: () => void;
}) {
  const { state, onConfigure, onCancel } = props;
  const inputId = useId();
  const feedbackId = `${inputId}-feedback`;
  const [profileDraft, setProfile] = useState<string | null>(null);
  const profile = profileDraft ?? state?.payload.url ?? "";
  const [saveError, setSaveError] = useState<string>();

  const isUsername = /^@?[a-z\d._-]+$/i.test(profile.trim());
  const normalizedUrl = normalizeGithubProfileInput(profile);
  const canSave =
    normalizedUrl !== undefined &&
    (normalizedUrl !== state?.payload.url || state?.resolution.status === "failed");

  return (
    <form
      autoComplete="off"
      className="mx-auto flex max-w-md flex-col gap-2 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave || normalizedUrl === undefined) return;
        setSaveError(undefined);
        const result = onConfigure({ url: normalizedUrl });
        if (result._tag === "Failure") setSaveError(result.failure.message);
        else setProfile(null);
      }}
    >
      <label className="font-medium" htmlFor={inputId}>
        GitHub profile URL or username
      </label>
      <Input
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
      {state?.resolution.status === "resolving" ? <p role="status">Resolving…</p> : null}
      {state?.resolution.error !== null && state?.resolution.error !== undefined ? (
        <p role="alert">{state.resolution.error.message}</p>
      ) : null}
      {saveError !== undefined ? (
        <p className="m-0 break-words" role="alert">
          {saveError}
        </p>
      ) : null}
      <div className="flex self-end gap-2">
        <Button
          onClick={() => {
            setProfile(null);
            setSaveError(undefined);
            onCancel();
          }}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button disabled={!canSave} type="submit">
          Save
        </Button>
      </div>
    </form>
  );
}
