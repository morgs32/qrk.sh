"use client";

import { stageAggregateSessionCommand } from "@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand";
import type { ILibrarySession } from "../../session/createLibraryStandaloneSession";
import { normalizeMapPlaceInput } from "./normalizeMapPlaceInput";

import { type IInferDecodedRow } from "@zerospin/shapes";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { GooglePlaceLookup } from "./GooglePlaceLookup";
import { mapPlaceV1 } from "./mapPlaceV1";

export function MapPlaceForm(props: {
  state: IInferDecodedRow<typeof mapPlaceV1.stateShape> | null;
  session: ILibrarySession;
  brickId: `brk_${string}`;
  onCancel: () => void;
}) {
  const { state, session, brickId, onCancel } = props;
  const [googlePlaceIdDraft, setGooglePlaceId] = useState<string | null>(null);
  const googlePlaceId = googlePlaceIdDraft ?? state?.payload.googlePlaceId ?? "";
  const [lookupRevision, setLookupRevision] = useState(0);
  const [saveError, setSaveError] = useState<string>();
  const normalizedPlaceId = normalizeMapPlaceInput(googlePlaceId);
  const canSave =
    normalizedPlaceId !== undefined &&
    (normalizedPlaceId !== state?.payload.googlePlaceId || state?.resolution.status === "failed");

  return (
    <form
      className="mx-auto flex w-full max-w-md flex-col gap-2 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave || normalizedPlaceId === undefined) return;
        setSaveError(undefined);
        const result = stageAggregateSessionCommand({
          session,
          contractName: "configureMapPlace",
          payload: { brickId, requestId: crypto.randomUUID(), googlePlaceId: normalizedPlaceId },
        });
        if (result._tag === "Failure") setSaveError(result.failure.message);
        else setGooglePlaceId(null);
      }}
    >
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 font-medium">Place</legend>
        <GooglePlaceLookup
          key={lookupRevision}
          onChange={(value) => {
            setGooglePlaceId(value);
            setSaveError(undefined);
          }}
          value={googlePlaceId}
        />
      </fieldset>
      <p className="m-0 break-words">Choose a place from the suggestions, then save.</p>
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
            setGooglePlaceId(null);
            setLookupRevision((revision) => revision + 1);
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
