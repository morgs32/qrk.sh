"use client";

import { X } from "lucide-react";
import { useId } from "react";
import { HexColorPicker } from "react-colorful";

import { Button } from "./button";
import { Field, FieldContent, FieldError, FieldLabel } from "./field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./input-group";
import { SwatchPopover } from "./SwatchPopover";

export function ColorInput(props: {
  label?: string;
  value: string;
  pickerColor: string;
  onChange: (color: string) => void;
  onCommit: (color: string) => void;
  picker?: "popover" | "inline";
  error?: string;
  invalid?: boolean;
}) {
  const {
    label = "Fill",
    value,
    pickerColor,
    onChange,
    onCommit,
    picker = "popover",
    error,
    invalid,
  } = props;
  const id = useId();
  const colorPicker = (
    <HexColorPicker
      color={pickerColor}
      onChange={onChange}
      onChangeEnd={onCommit}
      className="[&_.react-colorful\_\_saturation-pointer]:size-4!"
      style={{ width: "100%" }}
    />
  );

  return (
    <Field orientation="horizontal" data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_28px] gap-1">
          <InputGroup variant="sm">
            <InputGroupInput
              id={id}
              aria-invalid={invalid || undefined}
              aria-describedby={error === undefined ? undefined : `${id}-error`}
              value={value}
              placeholder="Add..."
              className="form-input-hex uppercase placeholder:normal-case"
              onChange={(event) => onChange(event.currentTarget.value)}
              onBlur={(event) => onCommit(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                event.currentTarget.blur();
              }}
            />
            {picker === "popover" && (
              <InputGroupAddon align="inline-end">
                <SwatchPopover label={label} color={value}>
                  {colorPicker}
                </SwatchPopover>
              </InputGroupAddon>
            )}
          </InputGroup>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Clear ${label.toLowerCase()}`}
            className="size-7 rounded-[9px] bg-neutral-50 text-neutral-500 hover:bg-neutral-200"
            onClick={() => onChange("")}
          >
            <X aria-hidden="true" className="size-3" />
          </Button>
        </div>
        {error === undefined ? null : <FieldError id={`${id}-error`}>{error}</FieldError>}
      </FieldContent>
      {picker === "inline" && <div className="col-span-full pt-2">{colorPicker}</div>}
    </Field>
  );
}
