"use client";

import type { IResult } from "@zerospin/error";
import { normalizeLinkInput } from "@qrk.sh/zerospin/src/modules/link/normalizeLinkInput";

import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { Schema } from "effect";
import type { LibraryApi } from "@qrk.sh/api/modules/LibraryApi.public";
import { useLayoutEffect, useId, useRef, useState } from "react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { linkV2 } from "@qrk.sh/zerospin/src/modules/link/linkV2";

export function LinkForm(props: {
  state: IInferDecodedRow<typeof linkV2.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof linkV2.stateShape>,
  ) => IResult<unknown, { message: string }>;
  onCancel: () => void;
}) {
  const { state, onSave, onCancel } = props;
  const inputId = useId();
  const feedbackId = `${inputId}-feedback`;
  const saveErrorId = `${inputId}-save-error`;
  const [urlDraft, setUrl] = useState<string | null>(null);
  const url = urlDraft ?? state?.payload.url ?? "";
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
  const normalizedUrl = normalizeLinkInput(url);
  const canSave =
    normalizedUrl !== undefined &&
    (normalizedUrl !== state?.payload.url || state?.data === null || saveError !== undefined);
  const hasMalformedUrl = url.trim().length > 0 && normalizedUrl === undefined;
  const hasError = hasMalformedUrl || saveError !== undefined;
  const describedBy = [
    feedbackId,
    saveError !== undefined ? saveErrorId : undefined,
  ]
    .filter((id): id is string => id !== undefined)
    .join(" ");

  return (
    <form
      autoComplete="off"
      className="mx-auto flex w-full max-w-md flex-col gap-2 p-4"
      noValidate
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
            const response = await api.linkBackend().getPreview(normalizedUrl);
            if (submission.signal.aborted) return;
            if (response._tag === "Left") {
              setSaveError(response.left.message);
              return;
            }
            const nextState = Schema.decodeUnknownSync(
              Schema.toType(
                makeEffectSchema({
                  ...linkV2.stateShape,
                  data: { ...linkV2.stateShape.data, nullable: false },
                }),
              ),
            )(
              { payload: { url: response.right.url }, data: response.right },
              { onExcessProperty: "ignore" },
            );
            const result = onSave(nextState);
            if (result._tag === "Failure") setSaveError(result.failure.message);
            else setUrl(null);
          } finally {
            submission.signal.removeEventListener("abort", close);
          }
        } catch (error) {
          if (
            !submission.signal.aborted &&
            !(error instanceof DOMException && error.name === "AbortError")
          ) {
            setSaveError(error instanceof Error ? error.message : "Unable to fetch this link preview; try again.");
          }
        } finally {
          if (activeSubmission.current === submission) {
            activeSubmission.current = null;
            setIsSaving(false);
          }
        }
      }}
    >
      <label className="text-sm font-medium leading-none" htmlFor={inputId}>
        Link URL
      </label>
      <Input
        disabled={isSaving}
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
      {isSaving ? (
        <p className="m-0 text-sm text-muted-foreground" role="status">
          Fetching…
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
            const submission = activeSubmission.current;
            activeSubmission.current = null;
            submission?.abort();
            setIsSaving(false);
            setSaveError(undefined);
            setUrl(null);
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
