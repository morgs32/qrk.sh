import { Select } from "@base-ui/react/select";
import { useId } from "react";
import { Field, FieldLabel } from "./field";
import { SelectContent, SelectItem, SelectTrigger } from "./select";

export function DropdownInput(props: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { label, value, options, onChange, placeholder = "Select…", disabled = false } = props;
  const id = useId();

  return (
    <Field orientation="horizontal">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select.Root
        items={options}
        value={value === "" ? null : value}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id}>
          <Select.Value data-slot="select-value" placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} sideOffset={4}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select.Root>
    </Field>
  );
}
