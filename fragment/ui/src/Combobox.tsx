import { useMemo, useRef } from 'react';

import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';

type IComboboxProps = Omit<
  ComboboxPrimitive.Root.Props<string>,
  'children' | 'items' | 'filteredItems' | 'itemToStringLabel' | 'multiple'
> & {
  label: string;
  options: ReadonlyArray<{
    value: string;
    label: string;
    disabled?: boolean;
  }>;
  placeholder?: string;
  className?: string;
  emptyLabel?: string;
  portalContainer?: ComboboxPrimitive.Portal.Props['container'];
};

export function Combobox({
  label,
  options,
  placeholder = 'Select…',
  className = '',
  emptyLabel = 'No results',
  portalContainer,
  value,
  defaultValue,
  autoHighlight = true,
  onValueChange,
  onInputValueChange,
  onOpenChange,
  onOpenChangeComplete,
  ...props
}: IComboboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputGroupRef = useRef<HTMLDivElement>(null);
  const selectedValueRef = useRef(defaultValue ?? null);
  const queryEditedRef = useRef(
    props.inputValue !== undefined || props.defaultInputValue !== undefined,
  );
  const selectAfterPointerFocusRef = useRef(false);
  const optionsByValue = useMemo(
    () => new Map(options.map(option => [option.value, option])),
    [options],
  );
  const items = useMemo(() => options.map(option => option.value), [options]);

  function selectCurrentLabel() {
    const input = inputRef.current;
    const selectedValue =
      value === undefined ? selectedValueRef.current : value;
    const selectedLabel =
      selectedValue == null
        ? undefined
        : optionsByValue.get(selectedValue)?.label;
    if (
      input &&
      !input.disabled &&
      !input.readOnly &&
      !queryEditedRef.current &&
      selectedLabel &&
      input.value === selectedLabel
    ) {
      input.select();
      return true;
    }
    return false;
  }

  return (
    <ComboboxPrimitive.Root<string>
      {...props}
      value={value}
      defaultValue={defaultValue}
      items={items}
      itemToStringLabel={itemValue =>
        optionsByValue.get(itemValue)?.label ?? ''
      }
      autoHighlight={autoHighlight}
      onValueChange={(nextValue, details) => {
        onValueChange?.(nextValue, details);
        if (details.isCanceled) return;
        selectedValueRef.current = nextValue;
        queryEditedRef.current = false;
      }}
      onInputValueChange={(inputValue, details) => {
        onInputValueChange?.(inputValue, details);
        if (details.isCanceled) return;
        queryEditedRef.current = details.reason === 'input-change';
        selectAfterPointerFocusRef.current = false;
      }}
      onOpenChange={(open, details) => {
        onOpenChange?.(open, details);
        if (details.isCanceled) return;
        if (
          open &&
          (details.reason === 'trigger-press' ||
            details.reason === 'list-navigation') &&
          inputRef.current?.ownerDocument.activeElement === inputRef.current
        ) {
          selectCurrentLabel();
        }
      }}
      onOpenChangeComplete={open => {
        if (!open) queryEditedRef.current = false;
        onOpenChangeComplete?.(open);
      }}
    >
      <ComboboxPrimitive.InputGroup
        ref={inputGroupRef}
        className={`fragment-combobox ${className}`}
      >
        <ComboboxPrimitive.Input
          ref={inputRef}
          aria-label={label}
          placeholder={placeholder}
          className="fragment-combobox-input"
          onPointerDown={event => {
            selectAfterPointerFocusRef.current =
              event.button === 0 &&
              event.currentTarget.ownerDocument.activeElement !==
                event.currentTarget;
          }}
          onFocus={selectCurrentLabel}
          onMouseUp={event => {
            if (selectAfterPointerFocusRef.current && selectCurrentLabel()) {
              event.preventDefault();
            }
            selectAfterPointerFocusRef.current = false;
          }}
        />
        <ComboboxPrimitive.Trigger
          aria-label={`Toggle ${label} options`}
          className="fragment-combobox-trigger"
        >
          <ComboboxPrimitive.Icon className="fragment-combobox-arrow">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M6 1.5v8m-3-3 3 3 3-3" />
            </svg>
          </ComboboxPrimitive.Icon>
        </ComboboxPrimitive.Trigger>
      </ComboboxPrimitive.InputGroup>
      <ComboboxPrimitive.Portal container={portalContainer}>
        <ComboboxPrimitive.Positioner
          anchor={inputGroupRef}
          side="bottom"
          align="start"
          className="fragment-combobox-positioner"
        >
          <ComboboxPrimitive.Popup className="fragment-combobox-popup">
            <ComboboxPrimitive.Empty className="fragment-combobox-empty">
              {emptyLabel}
            </ComboboxPrimitive.Empty>
            <ComboboxPrimitive.List className="fragment-combobox-list">
              {(itemValue: string) => {
                const option = optionsByValue.get(itemValue);
                if (!option) return null;
                return (
                  <ComboboxPrimitive.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className="fragment-combobox-item"
                  >
                    <span>{option.label}</span>
                    <ComboboxPrimitive.ItemIndicator className="fragment-combobox-arrow">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        aria-hidden="true"
                      >
                        <path d="M6 10.5v-8m-3 3 3-3 3 3" />
                      </svg>
                    </ComboboxPrimitive.ItemIndicator>
                  </ComboboxPrimitive.Item>
                );
              }}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  );
}
