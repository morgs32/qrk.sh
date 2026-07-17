import * as React from 'react';

import { Combobox as ComboboxPrimitive } from '@base-ui/react';
import { clsx } from 'clsx';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

const Combobox = ComboboxPrimitive.Root;

function ComboboxInput(props: ComboboxPrimitive.Input.Props) {
  return (
    <div className="flex h-9 w-full items-center rounded-md border border-input bg-transparent shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <ComboboxPrimitive.Input
        data-slot="combobox-input"
        className="h-full min-w-0 flex-1 bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground"
        {...props}
      />
      <ComboboxPrimitive.Trigger
        aria-label="Open repo search"
        className="flex h-full w-9 items-center justify-center text-muted-foreground"
      >
        <ChevronDownIcon className="size-4" />
      </ComboboxPrimitive.Trigger>
    </div>
  );
}

function ComboboxContent({
  className,
  ...props
}: ComboboxPrimitive.Popup.Props) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side="bottom"
        sideOffset={6}
        align="start"
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={twMerge(
            clsx(
              'group/combobox-content max-h-96 w-(--anchor-width) min-w-80 overflow-hidden rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10',
              className,
            ),
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList(props: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className="max-h-80 overflow-y-auto p-1"
      {...props}
    />
  );
}

function ComboboxItem({
  className,
  children,
  ...props
}: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={twMerge(
        clsx(
          'relative flex w-full cursor-default items-center rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground',
          className,
        ),
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
        <CheckIcon className="size-4" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup(props: ComboboxPrimitive.Group.Props) {
  return <ComboboxPrimitive.Group data-slot="combobox-group" {...props} />;
}

function ComboboxLabel(props: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className="px-2 py-1.5 text-xs text-muted-foreground"
      {...props}
    />
  );
}

function ComboboxCollection(props: ComboboxPrimitive.Collection.Props) {
  return <ComboboxPrimitive.Collection {...props} />;
}

function ComboboxEmpty(props: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      className="hidden w-full justify-center py-3 text-sm text-muted-foreground group-data-empty/combobox-content:flex"
      {...props}
    />
  );
}

export {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
};
