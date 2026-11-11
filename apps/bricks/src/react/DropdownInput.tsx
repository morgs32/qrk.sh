import { Check, ChevronDown } from "lucide-react";
import { Select } from "radix-ui";
import { useId } from "react";

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
    <div className="group grid grid-cols-[76px_minmax(0,1fr)] items-center gap-1">
      <label
        htmlFor={id}
        className="flex h-7 items-center text-xs font-medium text-muted-foreground group-focus-within:text-primary"
      >
        {label}
      </label>
      <Select.Root value={value} onValueChange={onChange} disabled={disabled}>
        <Select.Trigger
          id={id}
          className="flex h-7 min-w-0 items-center justify-between gap-1.5 rounded-(--radius-form-input) bg-form-input px-2 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:truncate"
        >
          <Select.Value placeholder={placeholder} />
          <Select.Icon asChild>
            <ChevronDown aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={4}
            className="qrk-bricks z-50 min-w-(--radix-select-trigger-width) rounded-md border border-border bg-background p-1 text-xs text-foreground shadow-md"
          >
            <Select.Viewport>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className="relative flex cursor-default select-none items-center rounded-sm py-1.5 pr-6 pl-2 outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="absolute right-2">
                    <Check aria-hidden="true" className="size-3" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
