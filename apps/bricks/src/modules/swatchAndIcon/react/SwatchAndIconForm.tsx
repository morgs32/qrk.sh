"use client";

import type { IResult } from "@zerospin/error";
import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { Schema } from "effect";
import { useLayoutEffect, useRef, useState } from "react";

import { MaterialSymbolsIconLookup } from "./MaterialSymbolsIconLookup";
import { FieldGroup } from "../../../components/field";
import { ColorInput } from "../../../components/ColorInput";
import { swatchAndIconV1 } from "../definition/swatchAndIconV1";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";

const hexColorPattern = /^#?(?:[a-f\d]{3}|[a-f\d]{6})$/i;
const swatchStateSchema = Schema.toType(makeEffectSchema(swatchAndIconV1.stateShape));

export function SwatchAndIconForm(props: {
  state: IInferDecodedRow<typeof swatchAndIconV1.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof swatchAndIconV1.stateShape>,
  ) => IResult<unknown, { message: string }>;
  onDraftChange?: (draft: { state: unknown; pending: boolean; valid: boolean }) => void;
}) {
  const { state, onSave, onDraftChange } = props;
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
    <FieldGroup>
      <ColorInput
        label="Swatch color"
        error={colorError}
        invalid={
          colorError !== undefined && draftColor !== null && !hexColorPattern.test(draftColor)
        }
        value={draftColor ?? color}
        pickerColor={
          draftColor !== null && hexColorPattern.test(draftColor)
            ? `#${draftColor.replace(/^#/, "")}`
            : color
        }
        onChange={(value) => {
          const valid = hexColorPattern.test(value);
          onDraftChange?.({
            state: valid
              ? {
                  ...accepted.current,
                  payload: { ...accepted.current.payload, color: `#${value.replace(/^#/, "")}` },
                }
              : accepted.current,
            pending: true,
            valid: valid && draftIcon === null,
          });
          setDraftColor(value);
          setColorError(undefined);
        }}
        onCommit={(value) => {
          if (!hexColorPattern.test(value)) {
            setColorError("Enter a complete hex color, such as #4A7C59.");
            onDraftChange?.({ state: accepted.current, pending: false, valid: false });
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
          onDraftChange?.({
            state: accepted.current,
            pending: false,
            valid: error === undefined && draftIcon === null,
          });
        }}
      />
      <MaterialSymbolsIconLookup
        saveError={iconError}
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
          const validColor = draftColor === null || hexColorPattern.test(draftColor);
          onDraftChange?.({
            state:
              draftColor !== null && validColor
                ? {
                    ...accepted.current,
                    payload: {
                      ...accepted.current.payload,
                      color: `#${draftColor.replace(/^#/, "")}`,
                    },
                  }
                : accepted.current,
            pending: draftColor !== null,
            valid: error === undefined && validColor,
          });
        }}
      />
    </FieldGroup>
  );
}
