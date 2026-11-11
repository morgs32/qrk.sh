"use client";

import { HexColorPicker } from "react-colorful";

export function SwatchAndIconColorForm(props: {
  value: string;
  pickerColor: string;
  onChange: (color: string) => void;
  onCommit: (color: string) => void;
}) {
  const { value, pickerColor, onChange, onCommit } = props;
  return (
    <div className="space-y-4 py-5">
      <HexColorPicker
        color={pickerColor}
        onChange={onChange}
        onChangeEnd={onCommit}
        style={{ width: "100%" }}
      />
      <input
        autoComplete="off"
        data-1p-ignore="true"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onBlur={(event) => onCommit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          event.currentTarget.blur();
        }}
        aria-label="Hex color"
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1"
      />
    </div>
  );
}
