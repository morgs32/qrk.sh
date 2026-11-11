import { X } from "lucide-react";

import { Button } from "./button";
import { ColorInput } from "./ColorInput";
import { NumberInput } from "./NumberInput";
import { SwatchPopover } from "./SwatchPopover";

export function BorderInput(props: {
  value: { width: number | null; color: string };
  onChange: (value: { width: number | null; color: string }) => void;
}) {
  const { value, onChange } = props;
  const { width, color } = value;
  const pickerColor = /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(color) ? color : "#ffffff";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_28px] items-center gap-1">
      <NumberInput
        inline
        label="Border"
        value={width}
        min={0}
        placeholder="Add..."
        onChange={(next) => onChange({ ...value, width: next })}
        trailing={
          <SwatchPopover label="Border" color={color}>
            <ColorInput
              label="Color"
              value={color}
              pickerColor={pickerColor}
              picker="inline"
              onChange={(next) => onChange({ ...value, color: next })}
              onCommit={(next) => onChange({ ...value, color: next })}
            />
          </SwatchPopover>
        }
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Clear border"
        className="size-7 rounded-[9px] bg-neutral-50 text-neutral-500 hover:bg-neutral-200"
        onClick={() => onChange({ width: 0, color: "" })}
      >
        <X aria-hidden="true" className="size-3" />
      </Button>
    </div>
  );
}
