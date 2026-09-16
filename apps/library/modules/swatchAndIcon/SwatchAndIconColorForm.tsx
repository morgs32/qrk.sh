import { HexColorInput, HexColorPicker } from "react-colorful";

export function SwatchAndIconColorForm(props: {
  value: { color: string };
  onChange: (value: { color: string }) => void;
}) {
  return (
    <div className="space-y-4 py-5">
      <HexColorPicker
        color={props.value.color}
        onChange={(color) => props.onChange({ color })}
        style={{ width: "100%" }}
      />
      <HexColorInput
        color={props.value.color}
        onChange={(color) => props.onChange({ color })}
        prefixed
        aria-label="Hex color"
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1"
      />
    </div>
  );
}
