"use client";

import { stageAggregateSessionCommand } from "@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand";
import type { ILibrarySession } from "../../session/createLibraryStandaloneSession";
import { normalizeFigmaThumbnailInput } from "./normalizeFigmaThumbnailInput";

import { type InferDecodedRow } from "@zerospin/shapes";
import { useId, useState } from "react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { figmaThumbnailV1 } from "./figmaThumbnailV1";

export function FigmaThumbnailForm(props: {
  state: InferDecodedRow<typeof figmaThumbnailV1.stateShape> | null;
  session: ILibrarySession;
  brickId: `brk_${string}`;
  onCancel: () => void;
}) {
  const { state, session, brickId, onCancel } = props;
  const inputId = useId();
  const feedbackId = `${inputId}-feedback`;
  const [documentUrlDraft, setDocumentUrl] = useState<string | null>(null);
  const documentUrl = documentUrlDraft ?? state?.payload.url ?? "";
  const [saveError, setSaveError] = useState<string>();

  const normalizedUrl = normalizeFigmaThumbnailInput(documentUrl);
  const canSave =
    normalizedUrl !== undefined &&
    (normalizedUrl !== state?.payload.url || state?.resolution.status === "failed");

  return (
    <form
      className="mx-auto flex max-w-md flex-col gap-2 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave || normalizedUrl === undefined) return;
        setSaveError(undefined);
        const result = stageAggregateSessionCommand({
          session,
          contractName: "configureFigmaThumbnail",
          payload: { brickId, requestId: crypto.randomUUID(), url: normalizedUrl },
        });
        if (result._tag === "Failure") setSaveError(result.failure.message);
        else setDocumentUrl(null);
      }}
    >
      <label className="font-medium" htmlFor={inputId}>
        Figma document URL
      </label>
      <Input
        aria-describedby={feedbackId}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        id={inputId}
        onChange={(event) => {
          setDocumentUrl(event.target.value);
          setSaveError(undefined);
        }}
        placeholder="https://www.figma.com/design/AbCdEfGhIjKlMnOpQrStUv"
        spellCheck={false}
        type="text"
        value={documentUrl}
      />
      <p aria-live="polite" className="m-0 break-words" id={feedbackId}>
        {normalizedUrl !== undefined
          ? `Document URL: ${normalizedUrl}`
          : "Enter an HTTPS Figma document URL."}
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
            setDocumentUrl(null);
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
