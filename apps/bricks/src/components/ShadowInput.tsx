import { X } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "./button";
import { ColorInput } from "./ColorInput";
import { Field, FieldContent, FieldError, FieldLabel } from "./field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./input-group";
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
  const [error, setError] = useState<string>();
  const id = useId();
  const pickerColor = /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(color) ? color : "#ffffff";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_28px] items-start gap-1">
      <Field orientation="horizontal" data-invalid={error !== undefined || undefined}>
        <FieldLabel htmlFor={id}>Shadow</FieldLabel>
        <FieldContent>
          <InputGroup variant="sm">
            <InputGroupInput
              id={id}
              aria-invalid={error !== undefined || undefined}
              aria-describedby={error === undefined ? undefined : `${id}-error`}
              value={draft ?? [x, y, blur, spread].map((dimension) => dimension ?? 0).join(", ")}
              placeholder="Add..."
              onChange={(event) => {
                setDraft(event.currentTarget.value);
                setError(undefined);
              }}
              onBlur={(event) => {
                const parts = event.currentTarget.value.split(",").map((part) => part.trim());
                const [nextX, nextY, nextBlur, nextSpread] = parts.map(Number);
                if (
                  parts.length !== 4 ||
                  parts.some((part) => part === "") ||
                  ![nextX, nextY, nextBlur, nextSpread].every(Number.isFinite) ||
                  nextBlur < 0
                ) {
                  setError("Enter four numbers separated by commas. Blur must be zero or greater.");
                  return;
                }
                setError(undefined);
                onChange({ ...value, x: nextX, y: nextY, blur: nextBlur, spread: nextSpread });
                setDraft(null);
              }}
            />
            <InputGroupAddon align="inline-end">
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
                      setError(undefined);
                      onChange({ ...value, [key]: next });
                    }}
                  />
                ))}
              </SwatchPopover>
            </InputGroupAddon>
          </InputGroup>
          {error === undefined ? null : <FieldError id={`${id}-error`}>{error}</FieldError>}
        </FieldContent>
      </Field>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Clear shadow"
        className="size-7 rounded-[9px] bg-neutral-50 text-neutral-500 hover:bg-neutral-200"
        onClick={() => {
          setDraft(null);
          setError(undefined);
          onChange({ x: 0, y: 0, blur: 0, spread: 0, color: "" });
        }}
      >
        <X aria-hidden="true" className="size-3" />
      </Button>
    </div>
  );
}
