"use client";

import { HexColorInput, HexColorPicker } from "react-colorful";

export function SwatchAndIconColorForm(props: {
  value: { color: string };
  onChange: (value: { color: string }) => void;
}) {
  const { value, onChange } = props;
  return (
    <div className="space-y-4 py-5">
      <HexColorPicker
        color={/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value.color) ? value.color : "#000000"}
        onChange={(color) => onChange({ color })}
        style={{ width: "100%" }}
      />
      <HexColorInput
        autoComplete="off"
        data-1p-ignore="true"
        color={value.color}
        onChange={(color) => onChange({ color })}
        onInput={(event) => {
          const color = `#${event.currentTarget.value.replace(/[^a-f\d]/gi, "").slice(0, 6)}`;
          onChange({ color });
        }}
        prefixed
        aria-label="Hex color"
        pattern="#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{6})"
        required
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1"
      />
    </div>
  );
}
