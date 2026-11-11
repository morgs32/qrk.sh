import { RadioGroup } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";
import { useId, type ReactNode } from "react";

import { Field } from "./field";

export function ButtonGroupInput(props: {
  label: string;
  value: string;
  options: readonly { value: string; label: string; icon: ReactNode }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { label, value, options, onChange, disabled = false } = props;
  const id = useId();

  return (
    <Field orientation="horizontal">
      <span
        id={id}
        className="flex min-h-7 items-center text-xs font-medium text-muted-foreground group-focus-within/field:text-primary"
      >
        {label}
      </span>
      <RadioGroup
        aria-labelledby={id}
        value={value}
        onValueChange={(selected) => {
          if (typeof selected === "string" && selected !== "") onChange(selected);
        }}
        disabled={disabled}
        className="flex h-7 min-w-0 items-center gap-1 rounded-(--radius-form-input) bg-form-input p-1 disabled:opacity-50"
      >
        {options.map((option) => (
          <Radio.Root
            key={option.value}
            value={option.value}
            aria-label={option.label}
            title={option.label}
            className="flex h-full min-w-0 flex-1 items-center justify-center rounded-sm text-xs text-muted-foreground outline-none hover:bg-background/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 data-checked:bg-background data-checked:text-foreground [&_svg]:size-3.5"
          >
            {option.icon}
          </Radio.Root>
        ))}
      </RadioGroup>
    </Field>
  );
}
