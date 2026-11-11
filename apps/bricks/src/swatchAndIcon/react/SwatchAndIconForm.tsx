"use client";

import type { IResult } from "@zerospin/error";
import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { Schema } from "effect";
import { useLayoutEffect, useRef, useState } from "react";

import { MaterialSymbolsIconLookup } from "./MaterialSymbolsIconLookup";
import { SwatchAndIconColorForm } from "./SwatchAndIconColorForm";
import { swatchAndIconV1 } from "../definition/swatchAndIconV1";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";

const hexColorPattern = /^#?(?:[a-f\d]{3}|[a-f\d]{6})$/i;
const swatchStateSchema = Schema.toType(makeEffectSchema(swatchAndIconV1.stateShape));

export function SwatchAndIconForm(props: {
  state: IInferDecodedRow<typeof swatchAndIconV1.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof swatchAndIconV1.stateShape>,
  ) => IResult<unknown, { message: string }>;
}) {
  const { state, onSave } = props;
  if (state === null) throw new Error("Swatch and Icon requires configured state");
  const { hash, color } = state.payload;
  const { name, svg } = state.data;
  const accepted = useRef(state);
  const [draftColor, setDraftColor] = useState<string | null>(null);
  const [draftIcon, setDraftIcon] = useState<{ hash: string; name: string; svg: string } | null>(
    null,
  );
  const [colorError, setColorError] = useState<string>();
  const [iconError, setIconError] = useState<string>();

  // A later host update replaces the event handlers' last locally accepted value.
  useLayoutEffect(() => {
    accepted.current = { payload: { hash, color }, data: { name, svg } };
  }, [hash, color, name, svg]);

  useWarnBeforeUnload((draftColor !== null && draftColor !== color) || draftIcon !== null);

  const save = (nextState: typeof state) => {
    try {
      const decoded = Schema.decodeUnknownSync(swatchStateSchema)(nextState);
      const result = onSave(decoded);
      if (result._tag === "Failure") return result.failure.message ?? "Brick save was refused";
      accepted.current = decoded;
    } catch (cause) {
      return cause instanceof Error ? cause.message : String(cause);
    }
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="font-medium">Swatch color</legend>
        <SwatchAndIconColorForm
          value={draftColor ?? color}
          pickerColor={
            draftColor !== null && hexColorPattern.test(draftColor)
              ? `#${draftColor.replace(/^#/, "")}`
              : color
          }
          onChange={(value) => {
            setDraftColor(value);
            setColorError(undefined);
          }}
          onCommit={(value) => {
            if (!hexColorPattern.test(value)) {
              setColorError("Enter a complete hex color, such as #4A7C59.");
              return;
            }
            const nextColor = `#${value.replace(/^#/, "")}`;
            const previous = accepted.current;
            const currentHex = previous.payload.color
              .toLowerCase()
              .replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3");
            const nextHex = nextColor.toLowerCase().replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3");
            const error =
              currentHex === nextHex
                ? undefined
                : save({
                    payload: { hash: previous.payload.hash, color: nextColor },
                    data: previous.data,
                  });
            setColorError(error);
            setDraftColor(error === undefined ? null : value);
          }}
        />
        <MaterialSymbolsIconLookup
          value={draftIcon?.hash ?? hash}
          onChange={(icon) => {
            const previous = accepted.current;
            const error =
              previous.payload.hash === icon.hash &&
              previous.data.name === icon.name &&
              previous.data.svg === icon.svg
                ? undefined
                : save({
                    payload: { hash: icon.hash, color: previous.payload.color },
                    data: { name: icon.name, svg: icon.svg },
                  });
            setIconError(error);
            setDraftIcon(error === undefined ? null : icon);
          }}
        />
      </fieldset>
      {colorError !== undefined && (
        <p className="m-0" role="alert">
          {colorError}
        </p>
      )}
      {iconError !== undefined && (
        <p className="m-0" role="alert">
          {iconError}
        </p>
      )}
    </div>
  );
}
