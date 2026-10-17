"use client";

import type { IResult } from "@zerospin/error";

import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { Schema } from "effect";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { MaterialSymbolsIconLookup } from "./MaterialSymbolsIconLookup";
import { SwatchAndIconColorForm } from "./SwatchAndIconColorForm";
import { swatchAndIconV1 } from "./swatchAndIconV1";

export function SwatchAndIconForm(props: {
  state: IInferDecodedRow<typeof swatchAndIconV1.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof swatchAndIconV1.stateShape>,
  ) => IResult<unknown, { message: string }>;
  onCancel: () => void;
}) {
  const { state, onSave, onCancel } = props;
  const savedState = state ?? swatchAndIconV1.defaultState;
  const [draft, setDraft] = useState<{
    color: string;
    icon: { hash: string; name: string; svg: string };
  } | null>(null);
  const color = draft?.color ?? savedState.payload.color;
  const selectedIcon = draft?.icon ?? { hash: savedState.payload.hash, ...savedState.data };
  const [saveError, setSaveError] = useState<string>();

  return (
    <form
      className="flex w-full flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(color)) {
          setSaveError("Enter a complete hex color, such as #4A7C59.");
          return;
        }

        setSaveError(undefined);
        try {
          const nextState = Schema.decodeUnknownSync(
            Schema.toType(makeEffectSchema(swatchAndIconV1.stateShape)),
          )(
            {
              payload: { hash: selectedIcon.hash, color },
              data: { name: selectedIcon.name, svg: selectedIcon.svg },
            },
            { onExcessProperty: "ignore" },
          );
          const result = onSave(nextState);
          if (result._tag === "Failure") {
            setSaveError(result.failure.message ?? "Brick save was refused");
          } else setDraft(null);
        } catch (cause) {
          setSaveError(cause instanceof Error ? cause.message : String(cause));
        }
      }}
    >
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="font-medium">Swatch color</legend>
        <SwatchAndIconColorForm
          onChange={(value) => {
            setDraft({ color: value.color, icon: selectedIcon });
            setSaveError(undefined);
          }}
          value={{ color }}
        />
        <MaterialSymbolsIconLookup
          onChange={(value) => {
            setDraft({ color, icon: value });
            setSaveError(undefined);
          }}
          value={selectedIcon.hash}
        />
      </fieldset>
      {saveError !== undefined ? (
        <p className="m-0" role="alert">
          {saveError}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          onClick={() => {
            setDraft(null);
            setSaveError(undefined);
            onCancel();
          }}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
