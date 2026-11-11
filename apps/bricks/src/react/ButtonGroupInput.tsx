import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";
import { useId, type ReactNode } from "react";

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
    <div className="group grid grid-cols-[76px_minmax(0,1fr)] items-center gap-1">
      <span
        id={id}
        className="flex h-7 items-center text-xs font-medium text-muted-foreground group-focus-within:text-primary"
      >
        {label}
      </span>
      <ToggleGroup
        role="radiogroup"
        aria-labelledby={id}
        value={value === "" ? [] : [value]}
        onValueChange={(next) => {
          const [selected] = next;
          if (selected !== undefined && selected !== "") onChange(selected);
        }}
        disabled={disabled}
        className="flex h-7 min-w-0 items-center gap-1 rounded-(--radius-form-input) bg-form-input p-1 disabled:opacity-50"
      >
        {options.map((option) => (
          <Toggle
            key={option.value}
            value={option.value}
            aria-label={option.label}
            title={option.label}
            role="radio"
            aria-checked={value !== "" && option.value === value}
            aria-pressed={undefined}
            className="flex h-full min-w-0 flex-1 items-center justify-center rounded-sm text-xs text-muted-foreground outline-none hover:bg-background/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 data-pressed:bg-background data-pressed:text-foreground [&_svg]:size-3.5"
          >
            {option.icon}
          </Toggle>
        ))}
      </ToggleGroup>
    </div>
  );
}
