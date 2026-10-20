"use client";

import type { IResult } from "@zerospin/error";
import { normalizeLinkInput } from "./normalizeLinkInput";

import { type IInferDecodedRow } from "@zerospin/shapes";
import { useId, useState } from "react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { linkV1 } from "./linkV1";

export function LinkForm(props: {
  state: IInferDecodedRow<typeof linkV1.stateShape> | null;
  onConfigure: (input: { url: string }) => IResult<unknown, { message: string }>;
  onCancel: () => void;
}) {
  const { state, onConfigure, onCancel } = props;
  const inputId = useId();
  const feedbackId = `${inputId}-feedback`;
  const resolutionErrorId = `${inputId}-resolution-error`;
  const saveErrorId = `${inputId}-save-error`;
  const [urlDraft, setUrl] = useState<string | null>(null);
  const url = urlDraft ?? state?.payload.url ?? "";
  const [saveError, setSaveError] = useState<string>();
  const normalizedUrl = normalizeLinkInput(url);
  const canSave =
    normalizedUrl !== undefined &&
    (normalizedUrl !== state?.payload.url || state?.resolution.status === "failed");
  const hasMalformedUrl = url.trim().length > 0 && normalizedUrl === undefined;
  const resolutionError =
    state?.resolution.error !== null && state?.resolution.error !== undefined
      ? state.resolution.error.message
      : undefined;
  const hasError = hasMalformedUrl || resolutionError !== undefined || saveError !== undefined;
  const describedBy = [
    feedbackId,
    resolutionError !== undefined ? resolutionErrorId : undefined,
    saveError !== undefined ? saveErrorId : undefined,
  ]
    .filter((id): id is string => id !== undefined)
    .join(" ");

  return (
    <form
      autoComplete="off"
      className="mx-auto flex w-full max-w-md flex-col gap-2 p-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave || normalizedUrl === undefined) return;
        setSaveError(undefined);
        const result = onConfigure({ url: normalizedUrl });
        if (result._tag === "Failure") setSaveError(result.failure.message);
        else setUrl(null);
      }}
    >
      <label className="text-sm font-medium leading-none" htmlFor={inputId}>
        Link URL
      </label>
      <Input
        aria-describedby={describedBy}
        aria-invalid={hasError}
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
      <p
        aria-live="polite"
        className="m-0 break-words text-sm leading-normal text-muted-foreground"
        id={feedbackId}
      >
        Enter an HTTP or HTTPS URL. Save fetches its link preview.
      </p>
      {state?.resolution.status === "resolving" ? (
        <p className="m-0 text-sm text-muted-foreground" role="status">
          Resolving…
        </p>
      ) : null}
      {resolutionError !== undefined ? (
        <p className="m-0 break-words text-sm text-destructive" id={resolutionErrorId} role="alert">
          {resolutionError}
        </p>
      ) : null}
      {saveError !== undefined ? (
        <p className="m-0 break-words text-sm text-destructive" id={saveErrorId} role="alert">
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
