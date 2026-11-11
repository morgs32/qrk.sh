import { NumberField } from "@base-ui/react/number-field";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Button } from "./button";
import { InputGroupAddon, InputGroupInput, inputGroupClassName } from "./input-group";

export function NumberInput(props: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  placeholder?: string;
  prefix?: string;
  leadingIcon?: ReactNode;
  trailing?: ReactNode;
  inline?: boolean;
  steppers?: boolean;
}) {
  const {
    label,
    value,
    onChange,
    min,
    placeholder,
    prefix,
    leadingIcon,
    trailing,
    inline = false,
    steppers = false,
  } = props;
  const id = useId();
  const labelClass =
    "select-none text-xs leading-none font-medium text-muted-foreground group-focus-within:text-primary";
  const stepperClass =
    "h-[13px] w-6 rounded-sm text-neutral-600 hover:bg-transparent hover:text-neutral-950";

  return (
    <NumberField.Root
      id={id}
      value={value}
      min={min}
      step="any"
      allowWheelScrub={false}
      onValueChange={(next) => {
        if (next === null || (Number.isFinite(next) && (min === undefined || next >= min)))
          onChange(next);
      }}
      className={
        inline
          ? "group grid min-w-0 grid-cols-[76px_minmax(0,1fr)] items-center gap-1"
          : "group grid min-w-0 gap-1.5"
      }
    >
      {prefix === undefined && (
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
      )}
      <NumberField.Group className={inputGroupClassName} data-slot="input-group">
        <NumberField.Input
          render={<InputGroupInput />}
          aria-label={label}
          placeholder={placeholder}
        />
        {(prefix !== undefined || leadingIcon !== undefined) && (
          <InputGroupAddon aria-hidden="true" className="gap-1">
            {prefix}
            {leadingIcon}
          </InputGroupAddon>
        )}
        {steppers && (
          <div className="grid shrink-0 pr-1">
            <NumberField.Increment
              render={<Button variant="ghost" size="icon" />}
              aria-label={`Increase ${label.toLowerCase()}`}
              className={stepperClass}
            >
              <ChevronUp aria-hidden="true" className="size-3" />
            </NumberField.Increment>
            <NumberField.Decrement
              render={<Button variant="ghost" size="icon" />}
              aria-label={`Decrease ${label.toLowerCase()}`}
              className={stepperClass}
            >
              <ChevronDown aria-hidden="true" className="size-3" />
            </NumberField.Decrement>
          </div>
        )}
        {trailing === undefined ? null : (
          <InputGroupAddon align="inline-end">{trailing}</InputGroupAddon>
        )}
      </NumberField.Group>
    </NumberField.Root>
  );
}
