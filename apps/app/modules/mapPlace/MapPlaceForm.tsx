"use client";

import type { IResult } from "@zerospin/error";
import { normalizeMapPlaceInput } from "@qrk.sh/zerospin/src/modules/mapPlace/normalizeMapPlaceInput";

import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { Schema } from "effect";
import type { LibraryApi } from "@qrk.sh/api/modules/LibraryApi.public";
import { useLayoutEffect, useRef, useState } from "react";

import { Button } from "../components/ui/button";
import { GooglePlaceLookup } from "./GooglePlaceLookup";
import { mapPlaceV2 } from "@qrk.sh/zerospin/src/modules/mapPlace/mapPlaceV2";

export function MapPlaceForm(props: {
  state: IInferDecodedRow<typeof mapPlaceV2.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof mapPlaceV2.stateShape>,
  ) => IResult<unknown, { message: string }>;
  onCancel: () => void;
}) {
  const { state, onSave, onCancel } = props;
  const [googlePlaceIdDraft, setGooglePlaceId] = useState<string | null>(null);
  const googlePlaceId = googlePlaceIdDraft ?? state?.payload.googlePlaceId ?? "";
  const [lookupRevision, setLookupRevision] = useState(0);
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
  const normalizedPlaceId = normalizeMapPlaceInput(googlePlaceId);
  const canSave =
    normalizedPlaceId !== undefined &&
    (normalizedPlaceId !== state?.payload.googlePlaceId ||
      state?.data === null ||
      saveError !== undefined);

  return (
    <form
      autoComplete="off"
      className="mx-auto flex w-full max-w-md flex-col gap-2 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSave || normalizedPlaceId === undefined || activeSubmission.current !== null) return;
        const submission = new AbortController();
        activeSubmission.current = submission;
        setIsSaving(true);
        setSaveError(undefined);
        try {
          using api = newSyncRpcSession<LibraryApi>("/rpc");
          const close = () => api[Symbol.dispose]();
          submission.signal.addEventListener("abort", close, { once: true });
          try {
            const response = await api.googlePlacesBackend().getPlace(normalizedPlaceId);
            if (submission.signal.aborted) return;
            if (response._tag === "Left") {
              setSaveError(response.left.message);
              return;
            }
            if (
              response.right.googlePlaceId !== normalizedPlaceId ||
              !Number.isFinite(response.right.latitude) ||
              !Number.isFinite(response.right.longitude) ||
              Math.abs(response.right.latitude) > 90 ||
              Math.abs(response.right.longitude) > 180
            ) throw new Error("Invalid place response");
            const nextState = Schema.decodeUnknownSync(
              Schema.toType(
                makeEffectSchema({
                  ...mapPlaceV2.stateShape,
                  data: { ...mapPlaceV2.stateShape.data, nullable: false },
                }),
              ),
            )(
              { payload: { googlePlaceId: normalizedPlaceId }, data: response.right },
              { onExcessProperty: "ignore" },
            );
            const result = onSave(nextState);
            if (result._tag === "Failure") setSaveError(result.failure.message);
            else setGooglePlaceId(null);
          } finally {
            submission.signal.removeEventListener("abort", close);
          }
        } catch (error) {
          if (
            !submission.signal.aborted &&
            !(error instanceof DOMException && error.name === "AbortError")
          ) {
            setSaveError(error instanceof Error ? error.message : "Unable to fetch this place; try again.");
          }
        } finally {
          if (activeSubmission.current === submission) {
            activeSubmission.current = null;
            setIsSaving(false);
          }
        }
      }}
    >
      <fieldset disabled={isSaving} className="flex min-w-0 flex-col gap-2">
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
      {isSaving ? <p role="status">Fetching…</p> : null}
      {saveError !== undefined ? (
        <p className="m-0 break-words" role="alert">
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
            setGooglePlaceId(null);
            setLookupRevision((revision) => revision + 1);
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
