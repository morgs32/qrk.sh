"use client";

import { HexColorPicker } from "react-colorful";

import { Input } from "./Input";

export function ColorInput(props: {
  value: string;
  pickerColor: string;
  onChange: (color: string) => void;
  onCommit: (color: string) => void;
}) {
  const { value, pickerColor, onChange, onCommit } = props;
  return (
    <div className="space-y-4">
      <HexColorPicker
        color={pickerColor}
        onChange={onChange}
        onChangeEnd={onCommit}
        style={{ width: "100%" }}
      />
      <Input
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onBlur={(event) => onCommit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          event.currentTarget.blur();
        }}
        aria-label="Hex color"
      />
    </div>
  );
}
