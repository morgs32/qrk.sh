"use client";

import { ColorInput } from "../../react/ColorInput";

export function SwatchAndIconColorForm(props: {
  value: string;
  pickerColor: string;
  onChange: (color: string) => void;
  onCommit: (color: string) => void;
}) {
  const { value, pickerColor, onChange, onCommit } = props;
  return (
    <div className="space-y-4 py-5">
      <ColorInput value={value} pickerColor={pickerColor} onChange={onChange} onCommit={onCommit} />
    </div>
  );
}
