import { X } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "./button";
import { ColorInput } from "./ColorInput";
import { Input } from "./Input";
import { NumberInput } from "./NumberInput";
import { SwatchPopover } from "./SwatchPopover";

export function ShadowInput(props: {
  value: {
    x: number | null;
    y: number | null;
    blur: number | null;
    spread: number | null;
    color: string;
  };
  onChange: (value: {
    x: number | null;
    y: number | null;
    blur: number | null;
    spread: number | null;
    color: string;
  }) => void;
}) {
  const { value, onChange } = props;
  const { x, y, blur, spread, color } = value;
  const [draft, setDraft] = useState<string | null>(null);
  const id = useId();
  const pickerColor = /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(color) ? color : "#ffffff";

  return (
    <div className="group grid grid-cols-[76px_minmax(0,1fr)_28px] items-center gap-1">
      <label
        htmlFor={id}
        className="text-xs font-medium text-muted-foreground group-focus-within:text-primary"
      >
        Shadow
      </label>
      <div className="flex min-w-0 items-center rounded-(--radius-form-input) bg-form-input">
        <Input
          id={id}
          value={draft ?? [x, y, blur, spread].map((dimension) => dimension ?? 0).join(", ")}
          placeholder="Add..."
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={(event) => {
            const parts = event.currentTarget.value.split(",").map((part) => part.trim());
            if (parts.length !== 4 || parts.some((part) => part === "")) return;
            const [nextX, nextY, nextBlur, nextSpread] = parts.map(Number);
            if (![nextX, nextY, nextBlur, nextSpread].every(Number.isFinite) || nextBlur < 0)
              return;
            onChange({ ...value, x: nextX, y: nextY, blur: nextBlur, spread: nextSpread });
            setDraft(null);
          }}
        />
        <SwatchPopover label="Shadow" color={color}>
          <ColorInput
            label="Color"
            value={color}
            pickerColor={pickerColor}
            picker="inline"
            onChange={(next) => onChange({ ...value, color: next })}
            onCommit={(next) => onChange({ ...value, color: next })}
          />
          {[
            { key: "x", label: "X", dimension: x },
            { key: "y", label: "Y", dimension: y },
            { key: "blur", label: "Blur", dimension: blur },
            { key: "spread", label: "Spread", dimension: spread },
          ].map(({ key, label, dimension }) => (
            <NumberInput
              key={key}
              inline
              steppers
              label={label}
              value={dimension}
              min={key === "blur" ? 0 : undefined}
              onChange={(next) => {
                setDraft(null);
                onChange({ ...value, [key]: next });
              }}
            />
          ))}
        </SwatchPopover>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Clear shadow"
        className="size-7 rounded-[9px] bg-neutral-50 text-neutral-500 hover:bg-neutral-200"
        onClick={() => {
          setDraft(null);
          onChange({ x: 0, y: 0, blur: 0, spread: 0, color: "" });
        }}
      >
        <X aria-hidden="true" className="size-3" />
      </Button>
    </div>
  );
}
