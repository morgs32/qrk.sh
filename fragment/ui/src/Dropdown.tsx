import { useId } from 'react';

import { Menu as MenuPrimitive } from '@base-ui/react/menu';

type IDropdownProps = Pick<
  MenuPrimitive.Root.Props,
  'disabled' | 'open' | 'defaultOpen' | 'onOpenChange'
> & {
  label: string;
  items: ReadonlyArray<{
    id: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
  }>;
  className?: string;
  portalContainer?: MenuPrimitive.Portal.Props['container'];
};

export function Dropdown({
  label,
  items,
  className = '',
  portalContainer,
  ...props
}: IDropdownProps) {
  const triggerId = useId();

  return (
    <MenuPrimitive.Root
      triggerId={triggerId}
      defaultTriggerId={triggerId}
      {...props}
    >
      <MenuPrimitive.Trigger
        id={triggerId}
        className={`fragment-dropdown-trigger ${className}`}
      >
        {label}
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal container={portalContainer}>
        <MenuPrimitive.Positioner
          side="bottom"
          align="end"
          sideOffset={0}
          className="fragment-dropdown-positioner"
        >
          <MenuPrimitive.Popup className="fragment-dropdown-popup">
            {items.map(item => (
              <MenuPrimitive.Item
                key={item.id}
                disabled={item.disabled}
                onClick={item.onClick}
                className="fragment-dropdown-item"
              >
                {item.label}
              </MenuPrimitive.Item>
            ))}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}
