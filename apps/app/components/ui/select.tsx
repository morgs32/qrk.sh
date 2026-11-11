"use client";

import * as React from "react";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Select as SelectPrimitive } from "@base-ui/react/select";

import { cn } from "cn";

function Select(props: SelectPrimitive.Root.Props<string>) {
  const { children, ...rootProps } = props;
  return <SelectPrimitive.Root {...rootProps}>{children}</SelectPrimitive.Root>;
}

function SelectGroup(props: React.ComponentProps<typeof SelectPrimitive.Group>) {
  const { ...elementProps } = props;
  return <SelectPrimitive.Group data-slot="select-group" {...elementProps} />;
}

function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) {
  const { ...elementProps } = props;
  return <SelectPrimitive.Value data-slot="select-value" {...elementProps} />;
}

function SelectTrigger(
  props: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
    size?: "sm" | "default";
  },
) {
  const { className, size = "default", children, ...elementProps } = props;
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={(state) =>
        cn(
          "flex w-fit cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...elementProps}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDownIcon className="size-4 opacity-50" />} />
    </SelectPrimitive.Trigger>
  );
}

function SelectContent(
  props: SelectPrimitive.Popup.Props &
    Pick<
      SelectPrimitive.Positioner.Props,
      "align" | "alignItemWithTrigger" | "side" | "sideOffset"
    >,
) {
  const {
    className,
    children,
    align = "center",
    alignItemWithTrigger = true,
    side,
    sideOffset = 4,
    ...popupProps
  } = props;
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        side={side}
        sideOffset={sideOffset}
        className="z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={(state) =>
            cn(
              "relative flex max-h-(--available-height) min-w-[8rem] origin-(--transform-origin) flex-col rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
              !alignItemWithTrigger && "min-w-[max(8rem,var(--anchor-width))]",
              typeof className === "function" ? className(state) : className,
            )
          }
          {...popupProps}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List className="min-h-0 overflow-y-auto p-1">
            {children}
          </SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel(props: React.ComponentProps<typeof SelectPrimitive.GroupLabel>) {
  const { className, ...elementProps } = props;
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={(state) =>
        cn(
          "px-2 py-1.5 text-xs text-muted-foreground",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...elementProps}
    />
  );
}

function SelectItem(props: React.ComponentProps<typeof SelectPrimitive.Item>) {
  const { className, children, ...elementProps } = props;
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={(state) =>
        cn(
          "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...elementProps}
    >
      <span
        data-slot="select-item-indicator"
        className="absolute right-2 flex size-3.5 items-center justify-center"
      >
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator(props: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  const { className, ...elementProps } = props;
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={(state) =>
        cn(
          "pointer-events-none -mx-1 my-1 h-px bg-border",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...elementProps}
    />
  );
}

function SelectScrollUpButton(props: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  const { className, ...elementProps } = props;
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={(state) =>
        cn(
          "flex cursor-default items-center justify-center py-1",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...elementProps}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton(
  props: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>,
) {
  const { className, ...elementProps } = props;
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={(state) =>
        cn(
          "flex cursor-default items-center justify-center py-1",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...elementProps}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
