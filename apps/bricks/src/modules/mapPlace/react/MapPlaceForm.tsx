"use client";

import type { IResult } from "@zerospin/error";
import { normalizeMapPlaceInput } from "../definition/normalizeMapPlaceInput";

import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { Schema } from "effect";
import type { BricksApi } from "@qrk.sh/bricks/rpc";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { FieldGroup } from "../../../components/field";
import { GooglePlaceLookup } from "./GooglePlaceLookup";
import { mapPlaceV1 } from "../definition/mapPlaceV1";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";

export function MapPlaceForm(props: {
  state: IInferDecodedRow<typeof mapPlaceV1.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof mapPlaceV1.stateShape>,
  ) => IResult<unknown, { message: string }>;
  onDraftChange?: (draft: { state: unknown; pending: boolean; valid: boolean }) => void;
}) {
  const { state, onSave, onDraftChange } = props;
  const [googlePlaceIdDraft, setGooglePlaceId] = useState<string | null>(null);
  const googlePlaceId = googlePlaceIdDraft ?? state?.payload.googlePlaceId ?? "";
  const [saveError, setSaveError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => {
    onDraftChange?.({
      state,
      pending: isSaving,
      valid:
        googlePlaceIdDraft === null &&
        state !== null &&
        state.data !== null &&
        saveError === undefined,
    });
  }, [onDraftChange, state, googlePlaceIdDraft, isSaving, saveError]);
  useWarnBeforeUnload(googlePlaceId !== (state?.payload.googlePlaceId ?? "") || isSaving);
  const activeSubmission = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    return () => {
      const submission = activeSubmission.current;
      activeSubmission.current = null;
      submission?.abort();
    };
  }, []);
  async function selectPlace(value: string) {
    const normalizedPlaceId = normalizeMapPlaceInput(value);
    if (activeSubmission.current !== null) return;
    onDraftChange?.({ state, pending: normalizedPlaceId !== undefined, valid: false });
    setGooglePlaceId(value);
    if (
      normalizedPlaceId === undefined ||
      (normalizedPlaceId === state?.payload.googlePlaceId &&
        state.data !== null &&
        saveError === undefined)
    ) {
      setSaveError(undefined);
      if (normalizedPlaceId !== undefined && normalizedPlaceId === state?.payload.googlePlaceId)
        setGooglePlaceId(null);
      return;
    }

    const submission = new AbortController();
    activeSubmission.current = submission;
    setIsSaving(true);
    setSaveError(undefined);
    try {
      using api = newSyncRpcSession<BricksApi>("/rpc");
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
        )
          throw new Error("Invalid place response");
        const nextState = Schema.decodeUnknownSync(
          Schema.toType(
            makeEffectSchema({
              ...mapPlaceV1.stateShape,
              data: { ...mapPlaceV1.stateShape.data, nullable: false },
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
        setSaveError(
          error instanceof Error ? error.message : "Unable to fetch this place; try again.",
        );
      }
    } finally {
      if (activeSubmission.current === submission) {
        activeSubmission.current = null;
        setIsSaving(false);
      }
    }
  }

  return (
    <fieldset disabled={isSaving} className="min-w-0">
      <FieldGroup>
        <GooglePlaceLookup
          onChange={(value) => void selectPlace(value)}
          value={googlePlaceId}
          saveError={saveError}
          disabled={isSaving}
          status={isSaving ? "Fetching place…" : undefined}
        />
      </FieldGroup>
    </fieldset>
  );
}
