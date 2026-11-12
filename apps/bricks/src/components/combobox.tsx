import { Combobox } from "@base-ui/react/combobox";
import { cn } from "cn";

// shadcn Base UI Combobox result parts at Brick field density.
export function ComboboxContent(
  props: Omit<Combobox.Popup.Props, "className"> & { className?: string; sideOffset?: number },
) {
  const { className, sideOffset = 4, ...popupProps } = props;
  return (
    <Combobox.Portal>
      <Combobox.Positioner sideOffset={sideOffset} className="isolate z-50">
        <Combobox.Popup
          data-slot="combobox-content"
          className={cn(
            "group/combobox-content relative max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-md border border-border bg-background text-xs text-foreground shadow-lg",
            className,
          )}
          {...popupProps}
        />
      </Combobox.Positioner>
    </Combobox.Portal>
  );
}

export function ComboboxList(props: Combobox.List.Props) {
  const { ...listProps } = props;
  return (
    <Combobox.List
      data-slot="combobox-list"
      className="max-h-64 overflow-y-auto overscroll-contain empty:hidden"
      {...listProps}
    />
  );
}

export function ComboboxItem(props: Combobox.Item.Props) {
  const { ...itemProps } = props;
  return (
    <Combobox.Item
      data-slot="combobox-item"
      className="relative flex cursor-default items-start gap-2 rounded-sm px-3 py-2 outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
      {...itemProps}
    />
  );
}
