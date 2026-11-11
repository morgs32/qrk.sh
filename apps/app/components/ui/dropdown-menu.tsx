"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "cn";
import { Check } from "lucide-react";

// shadcn Base UI Dropdown Menu parts used by the Wall actions.
export function DropdownMenuTrigger(props: MenuPrimitive.Trigger.Props) {
  const { ...triggerProps } = props;
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...triggerProps} />;
}

export function DropdownMenuContent(
  props: Omit<MenuPrimitive.Popup.Props, "className"> &
    Pick<MenuPrimitive.Positioner.Props, "side" | "sideOffset" | "align"> & {
      className?: string;
      positionerClassName?: string;
    },
) {
  const { className, positionerClassName, side, sideOffset = 4, align, ...popupProps } = props;
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className={cn("isolate z-50", positionerClassName)}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "max-h-(--available-height) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md outline-none",
            className,
          )}
          {...popupProps}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem(
  props: Omit<MenuPrimitive.Item.Props, "className"> & { className?: string },
) {
  const { className, ...itemProps } = props;
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...itemProps}
    />
  );
}

export function DropdownMenuRadioGroup(props: MenuPrimitive.RadioGroup.Props) {
  const { ...groupProps } = props;
  return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...groupProps} />;
}

export function DropdownMenuRadioItem(
  props: Omit<MenuPrimitive.RadioItem.Props, "className"> & { className?: string },
) {
  const { className, children, ...itemProps } = props;
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md py-1.5 pr-2 pl-8 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...itemProps}
    >
      <span
        className="pointer-events-none absolute left-2 flex size-4 items-center justify-center"
        aria-hidden
      >
        <MenuPrimitive.RadioItemIndicator>
          <Check className="size-4" />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}
