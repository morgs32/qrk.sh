"use client";

import type { IResult } from "@zerospin/error";

import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { Schema } from "effect";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { ArticleEditorControl } from "./ArticleEditorControl";
import { articleV1 } from "./articleV1";

export function ArticleForm(props: {
  state: IInferDecodedRow<typeof articleV1.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof articleV1.stateShape>,
  ) => IResult<unknown, { message: string }>;
  onCancel: () => void;
}) {
  const { state, onSave, onCancel } = props;
  const savedState = state ?? articleV1.defaultState;
  const [draft, setDraft] = useState<IInferDecodedRow<typeof articleV1.stateShape> | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [saveError, setSaveError] = useState<string>();
  const editedState = draft ?? savedState;
  const canSave = JSON.stringify(editedState) !== JSON.stringify(savedState);

  return (
    <form
      autoComplete="off"
      className="flex w-full flex-col gap-6"
      onSubmit={(event) => {
        // Native Meowdown link forms submit through their React portal owner.
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        if (!canSave) return;
        setSaveError(undefined);
        try {
          const nextState = Schema.decodeUnknownSync(
            Schema.toType(makeEffectSchema(articleV1.stateShape)),
          )(editedState);
          const result = onSave(nextState);
          if (result._tag === "Failure") {
            setSaveError(result.failure.message ?? "Brick save was refused");
            return;
          }
          setDraft(null);
        } catch (cause) {
          setSaveError(cause instanceof Error ? cause.message : String(cause));
        }
      }}
    >
      <fieldset className="contents">
        <ArticleEditorControl
          key={editorKey}
          title={editedState.title}
          subtitle={editedState.subtitle}
          value={editedState.content}
          readOnly={false}
          drawer={{
            onTitleChange: (title) => {
              setDraft((current) => ({ ...(current ?? savedState), title }));
              setSaveError(undefined);
            },
            onSubtitleChange: (subtitle) => {
              setDraft((current) => ({ ...(current ?? savedState), subtitle }));
              setSaveError(undefined);
            },
            onChange: (content) => {
              setDraft((current) => ({ ...(current ?? savedState), content }));
              setSaveError(undefined);
            },
          }}
        />
      </fieldset>
      {saveError !== undefined ? (
        <p className="m-0 break-words" role="alert">
          {saveError}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          onClick={() => {
            setDraft(null);
            setEditorKey((current) => current + 1);
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
