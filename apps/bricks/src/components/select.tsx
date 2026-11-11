import { Select } from "@base-ui/react/select";
import { cn } from "cn";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

// shadcn Base UI Select parts at Brick field density.
export function SelectTrigger(
  props: Omit<Select.Trigger.Props, "className"> & { className?: string },
) {
  const { className, children, ...triggerProps } = props;
  return (
    <Select.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-7 min-w-0 items-center justify-between gap-1.5 rounded-(--radius-form-input) bg-form-input px-2 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 data-placeholder:text-muted-foreground [&>span]:truncate",
        className,
      )}
      {...triggerProps}
    >
      {children}
      <Select.Icon
        render={<ChevronDown aria-hidden className="size-3 shrink-0 text-muted-foreground" />}
      />
    </Select.Trigger>
  );
}

export function SelectContent(
  props: Select.Popup.Props & Pick<Select.Positioner.Props, "alignItemWithTrigger" | "sideOffset">,
) {
  const { alignItemWithTrigger = true, sideOffset = 4, children, ...popupProps } = props;
  return (
    <Select.Portal>
      <Select.Positioner
        alignItemWithTrigger={alignItemWithTrigger}
        sideOffset={sideOffset}
        className="z-50"
      >
        <Select.Popup
          data-slot="select-content"
          className="qrk-bricks min-w-(--anchor-width) rounded-md border border-border bg-background text-xs text-foreground shadow-md"
          {...popupProps}
        >
          <Select.ScrollUpArrow
            data-slot="select-scroll-up-button"
            className="flex justify-center bg-background py-1"
          >
            <ChevronUp aria-hidden className="size-3" />
          </Select.ScrollUpArrow>
          <Select.List className="max-h-(--available-height) overflow-auto p-1">
            {children}
          </Select.List>
          <Select.ScrollDownArrow
            data-slot="select-scroll-down-button"
            className="flex justify-center bg-background py-1"
          >
            <ChevronDown aria-hidden className="size-3" />
          </Select.ScrollDownArrow>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  );
}

export function SelectItem(props: Select.Item.Props) {
  const { children, ...itemProps } = props;
  return (
    <Select.Item
      data-slot="select-item"
      className="relative flex cursor-default select-none items-center rounded-sm py-1.5 pr-6 pl-2 outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
      {...itemProps}
    >
      <Select.ItemText>{children}</Select.ItemText>
      <Select.ItemIndicator className="absolute right-2">
        <Check aria-hidden className="size-3" />
      </Select.ItemIndicator>
    </Select.Item>
  );
}
