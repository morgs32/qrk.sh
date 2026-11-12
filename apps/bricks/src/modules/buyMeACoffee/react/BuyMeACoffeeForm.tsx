"use client";

import type { IResult } from "@zerospin/error";
import type { IInferDecodedRow } from "@zerospin/shapes";
import { useEffect, useState } from "react";

import { Button } from "../../../components/button";
import { FieldGroup } from "../../../components/field";
import { TextInput } from "../../../components/TextInput";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";
import { normalizeCoffeeUrl } from "../definition/buyMeACoffeeSchemas";
import type { buyMeACoffeeV1 } from "../definition/buyMeACoffeeV1";

export function BuyMeACoffeeForm(props: {
  state: IInferDecodedRow<typeof buyMeACoffeeV1.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof buyMeACoffeeV1.stateShape>,
  ) => IResult<unknown, { message: string }>;
  onDraftChange?: (draft: { state: unknown; pending: boolean; valid: boolean }) => void;
}) {
  const { state, onSave, onDraftChange } = props;
  const [urlDraft, setUrl] = useState<string>();
  const [messageDraft, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const url = urlDraft ?? state?.payload.url ?? "";
  const message = messageDraft ?? state?.payload.message ?? "";
  useEffect(() => {
    const normalized = normalizeCoffeeUrl(url);
    onDraftChange?.({
      state:
        normalized === undefined
          ? state
          : { payload: { url: normalized, message: message.trim() } },
      pending: false,
      valid: normalized !== undefined && message.trim().length <= 160 && error === undefined,
    });
  }, [onDraftChange, state, url, message, error]);
  useWarnBeforeUnload(urlDraft !== undefined || messageDraft !== undefined);
  return (
    <form
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        const normalized = normalizeCoffeeUrl(url);
        if (normalized === undefined) {
          setError("Enter a Buy Me a Coffee creator page URL.");
          return;
        }
        const result = onSave({ payload: { url: normalized, message: message.trim() } });
        if (result._tag === "Failure") {
          setError(result.failure.message);
          return;
        }
        setError(undefined);
        setUrl(undefined);
        setMessage(undefined);
      }}
    >
      <FieldGroup>
        <TextInput
          label="Buy Me a Coffee page URL"
          orientation="vertical"
          value={url}
          error={error}
          onChange={(event) => {
            onDraftChange?.({ state, pending: false, valid: false });
            setUrl(event.currentTarget.value);
            setError(undefined);
          }}
        />
        <TextInput
          label="Support message (optional)"
          orientation="vertical"
          value={message}
          maxLength={160}
          onChange={(event) => {
            onDraftChange?.({ state, pending: false, valid: false });
            setMessage(event.currentTarget.value);
          }}
        />
        <Button type="submit">Save</Button>
      </FieldGroup>
    </form>
  );
}
