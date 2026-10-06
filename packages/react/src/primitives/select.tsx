// Adapted from https://www.shadcn-cssinjs.com/r/select.json. MIT: see LICENSE.shadcn-cssinjs.
import { Select as SelectPrimitive } from '@base-ui/react/select';
import * as stylex from '@stylexjs/stylex';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';

import { colors, radius } from './tokens.stylex.js';

const styles = stylex.create({
  content: {
    backgroundColor: colors.popover,
    borderRadius: radius.md,
    boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1), 0 0 0 1px color-mix(in oklab, ${colors.foreground} 10%, transparent)`,
    color: colors.popoverForeground,
    isolation: 'isolate',
    maxHeight: 'var(--available-height)',
    minWidth: '9rem',
    opacity: 1,
    outline: 'none',
    overflowX: 'hidden',
    overflowY: 'auto',
    position: 'relative',
    transform: 'scale(1)',
    transformOrigin: 'var(--transform-origin)',
    transitionDuration: '100ms',
    transitionProperty: 'opacity, transform',
    transitionTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
    width: 'var(--anchor-width)',
    zIndex: 50,
  },
  contentHidden: {
    opacity: 0,
    transform: 'scale(0.95)',
  },
  icon: {
    flexShrink: 0,
    height: '1rem',
    pointerEvents: 'none',
    width: '1rem',
  },
  item: {
    ':is(svg)': {
      flexShrink: 0,
      height: '1rem',
      pointerEvents: 'none',
      width: '1rem',
    },
    alignItems: 'center',
    backgroundColor: {
      ':focus': colors.accent,
      ':hover': colors.accent,
      default: 'transparent',
    },
    borderRadius: radius.md,
    boxSizing: 'border-box',
    color: {
      ':focus': colors.accentForeground,
      ':hover': colors.accentForeground,
      default: colors.foreground,
    },
    cursor: 'default',
    display: 'flex',
    fontSize: '0.875rem',
    gap: '0.375rem',
    lineHeight: '1.25rem',
    outline: 'none',
    paddingBottom: '0.25rem',
    paddingLeft: '0.375rem',
    paddingRight: '2rem',
    paddingTop: '0.25rem',
    position: 'relative',
    userSelect: 'none',
    width: '100%',
  },
  itemDisabled: {
    cursor: 'not-allowed',
    opacity: 0.5,
    pointerEvents: 'none',
  },
  itemHighlighted: {
    backgroundColor: colors.accent,
    color: colors.accentForeground,
  },
  itemIndicator: {
    alignItems: 'center',
    display: 'flex',
    height: '1rem',
    justifyContent: 'center',
    pointerEvents: 'none',
    position: 'absolute',
    right: '0.5rem',
    width: '1rem',
  },
  itemText: {
    display: 'flex',
    flex: 1,
    flexShrink: 0,
    gap: '0.5rem',
    whiteSpace: 'nowrap',
  },
  list: {
    boxSizing: 'border-box',
    padding: '0.25rem',
  },
  positioner: {
    isolation: 'isolate',
    outline: 'none',
    zIndex: 50,
  },
  trigger: {
    ':is(svg)': {
      flexShrink: 0,
      height: '1rem',
      pointerEvents: 'none',
      width: '1rem',
    },
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: {
      ':focus-visible': colors.ring,
      default: colors.input,
    },
    borderRadius: radius.md,
    borderStyle: 'solid',
    borderWidth: '1px',
    boxSizing: 'border-box',
    boxShadow: {
      ':focus-visible': `0 0 0 3px color-mix(in oklab, ${colors.ring} 50%, transparent)`,
      default: null,
    },
    cursor: {
      ':disabled': 'not-allowed',
      default: 'pointer',
    },
    display: 'flex',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    gap: '0.375rem',
    justifyContent: 'space-between',
    lineHeight: '1.25rem',
    opacity: {
      ':disabled': 0.5,
      default: 1,
    },
    outline: 'none',
    paddingBottom: '0.5rem',
    paddingLeft: '0.625rem',
    paddingRight: '0.5rem',
    paddingTop: '0.5rem',
    pointerEvents: {
      ':disabled': 'none',
      default: null,
    },
    transitionDuration: '150ms',
    transitionProperty: 'color, background-color, border-color, box-shadow',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    width: '100%',
  },
  triggerAriaInvalid: {
    borderColor: colors.destructive,
    boxShadow: {
      ':focus-visible': `0 0 0 3px color-mix(in oklab, ${colors.destructive} 40%, transparent)`,
      default: `0 0 0 3px color-mix(in oklab, ${colors.destructive} 20%, transparent)`,
    },
  },
  triggerDefault: {
    height: '2rem',
  },
  triggerIcon: {
    color: colors.mutedForeground,
    flexShrink: 0,
    height: '1rem',
    pointerEvents: 'none',
    width: '1rem',
  },
  value: {
    display: 'flex',
    flex: 1,
    textAlign: 'left',
  },
});
export function Select(props: {
  id: string;
  name: string;
  values: readonly string[];
  value: string;
  disabled: boolean;
  invalid: boolean;
  describedBy: string | undefined;
  onBlur: () => void;
  onChange: (value: string) => void;
}) {
  const {
    id,
    name,
    values,
    value,
    disabled,
    invalid,
    describedBy,
    onBlur,
    onChange,
  } = props;
  return (
    <SelectPrimitive.Root
      name={name}
      items={values.map(item => ({ value: item, label: item }))}
      value={value}
      disabled={disabled}
      onValueChange={next => {
        if (next !== null) onChange(next);
      }}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onBlur={onBlur}
        data-slot="select-trigger"
        {...stylex.props(
          styles.trigger,
          styles.triggerDefault,
          invalid && styles.triggerAriaInvalid,
        )}
      >
        <SelectPrimitive.Value {...stylex.props(styles.value)} />
        <SelectPrimitive.Icon>
          <ChevronDownIcon {...stylex.props(styles.triggerIcon)} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          sideOffset={4}
          alignItemWithTrigger={false}
          {...stylex.props(styles.positioner)}
        >
          <SelectPrimitive.Popup
            data-slot="select-content"
            className={state =>
              stylex.props(
                styles.content,
                (state.transitionStatus === 'starting' ||
                  state.transitionStatus === 'ending') &&
                  styles.contentHidden,
              ).className
            }
          >
            <SelectPrimitive.List {...stylex.props(styles.list)}>
              {values.map(item => (
                <SelectPrimitive.Item
                  key={item}
                  value={item}
                  className={state =>
                    stylex.props(
                      styles.item,
                      state.highlighted && styles.itemHighlighted,
                      state.disabled && styles.itemDisabled,
                    ).className
                  }
                >
                  <SelectPrimitive.ItemText {...stylex.props(styles.itemText)}>
                    {item}
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator
                    {...stylex.props(styles.itemIndicator)}
                  >
                    <CheckIcon {...stylex.props(styles.icon)} />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
