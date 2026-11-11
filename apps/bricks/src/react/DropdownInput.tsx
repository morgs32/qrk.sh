import { Check, ChevronDown } from "lucide-react";
import { Select } from "@base-ui/react/select";
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
      <Select.Root
        items={options}
        value={value === "" ? null : value}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
        disabled={disabled}
      >
        <Select.Trigger
          id={id}
          className="flex h-7 min-w-0 items-center justify-between gap-1.5 rounded-(--radius-form-input) bg-form-input px-2 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:truncate"
        >
          <Select.Value placeholder={placeholder} />
          <Select.Icon
            render={
              <ChevronDown aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
            }
          />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner alignItemWithTrigger={false} sideOffset={4} className="z-50">
            <Select.Popup className="qrk-bricks min-w-(--anchor-width) rounded-md border border-border bg-background text-xs text-foreground shadow-md">
              <Select.List className="max-h-(--available-height) overflow-auto p-1">
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
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
