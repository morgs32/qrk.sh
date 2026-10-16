"use client";

import { stageAggregateSessionCommand } from "@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand";
import type { ILibrarySession } from "../../session/createLibraryStandaloneSession";
import { normalizeLinkInput } from "./normalizeLinkInput";

import { type InferDecodedRow } from "@zerospin/shapes";
import { useId, useState } from "react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { linkV1 } from "./linkV1";

export function LinkForm(props: {
  state: InferDecodedRow<typeof linkV1.stateShape> | null;
  session: ILibrarySession;
  brickId: `brk_${string}`;
  onCancel: () => void;
}) {
  const { state, session, brickId, onCancel } = props;
  const inputId = useId();
  const feedbackId = `${inputId}-feedback`;
  const [urlDraft, setUrl] = useState<string | null>(null);
  const url = urlDraft ?? state?.payload.url ?? "";
  const [saveError, setSaveError] = useState<string>();
  const normalizedUrl = normalizeLinkInput(url);
  const canSave =
    normalizedUrl !== undefined &&
    (normalizedUrl !== state?.payload.url || state?.resolution.status === "failed");

  return (
    <form
      className="mx-auto flex w-full max-w-md flex-col gap-2 p-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave || normalizedUrl === undefined) return;
        setSaveError(undefined);
        const result = stageAggregateSessionCommand({
          session,
          contractName: "configureLink",
          payload: { brickId, requestId: crypto.randomUUID(), url: normalizedUrl },
        });
        if (result._tag === "Failure") setSaveError(result.failure.message);
        else setUrl(null);
      }}
    >
      <label className="font-medium" htmlFor={inputId}>
        Link URL
      </label>
      <Input
        aria-describedby={feedbackId}
        aria-invalid={url.trim().length > 0 && normalizedUrl === undefined}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        id={inputId}
        onChange={(event) => {
          setUrl(event.target.value);
          setSaveError(undefined);
        }}
        placeholder="https://example.com"
        spellCheck={false}
        type="url"
        value={url}
      />
      <p aria-live="polite" className="m-0 break-words" id={feedbackId}>
        Enter an HTTP or HTTPS URL. Save fetches its link preview.
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
      <div className="flex justify-end gap-2">
        <Button
          onClick={() => {
            setSaveError(undefined);
            setUrl(null);
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
