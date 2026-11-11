"use client";

import { X } from "lucide-react";
import { useId } from "react";
import { HexColorPicker } from "react-colorful";

import { Button } from "./button";
import { Input } from "./Input";
import { SwatchPopover } from "./SwatchPopover";

export function ColorInput(props: {
  label?: string;
  value: string;
  pickerColor: string;
  onChange: (color: string) => void;
  onCommit: (color: string) => void;
  picker?: "popover" | "inline";
}) {
  const { label = "Fill", value, pickerColor, onChange, onCommit, picker = "popover" } = props;
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
    <div className="grid gap-3">
      <div className="group grid grid-cols-[76px_minmax(0,1fr)_28px] items-center gap-1">
        <label
          htmlFor={id}
          className="flex h-7 select-none items-center text-xs leading-none font-medium text-muted-foreground transition-colors group-focus-within:text-primary"
        >
          {label}
        </label>
        <div className="flex min-w-0 items-center rounded-(--radius-form-input) bg-form-input">
          <Input
            id={id}
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
            <SwatchPopover label={label} color={value}>
              {colorPicker}
            </SwatchPopover>
          )}
        </div>
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
      {picker === "inline" && colorPicker}
    </div>
  );
}
