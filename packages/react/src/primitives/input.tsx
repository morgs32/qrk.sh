// Adapted from https://www.shadcn-cssinjs.com/r/input.json. MIT: see LICENSE.shadcn-cssinjs.
'use client';

import type * as React from 'react';

import { Input as InputPrimitive } from '@base-ui/react/input';
import * as stylex from '@stylexjs/stylex';

import { colors, radius } from './tokens.stylex.js';

const styles = stylex.create({
  ariaInvalid: {
    borderColor: colors.destructive,
    boxShadow: `0 0 0 3px color-mix(in oklab, ${colors.destructive} 20%, transparent)`,
  },
  root: {
    '::placeholder': {
      color: colors.mutedForeground,
    },
    backgroundColor: {
      ':disabled': `color-mix(in oklab, ${colors.input} 50%, transparent)`,
      default: 'transparent',
    },
    borderColor: {
      ':focus-visible': colors.ring,
      default: colors.input,
    },
    borderRadius: radius.md,
    borderStyle: 'solid',
    borderWidth: '1px',
    boxShadow: {
      ':focus-visible': `0 0 0 3px color-mix(in oklab, ${colors.ring} 50%, transparent)`,
      default: 'none',
    },
    boxSizing: 'border-box',
    color: colors.foreground,
    cursor: {
      ':disabled': 'not-allowed',
      default: 'auto',
    },
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    height: '2rem',
    lineHeight: '1.25rem',
    minWidth: 0,
    opacity: {
      ':disabled': 0.5,
      default: 1,
    },
    outline: 'none',
    paddingBlock: '0.25rem',
    paddingInline: '0.75rem',
    pointerEvents: {
      ':disabled': 'none',
      default: null,
    },
    transitionDuration: '150ms',
    transitionProperty: 'color, background-color, border-color, box-shadow',
    transitionTimingFunction: 'ease-in-out',
    width: '100%',
  },
});

type IInputProps = Omit<React.ComponentProps<'input'>, 'style' | 'className'>;

const Input = ({
  type,
  'aria-invalid': ariaInvalid,
  ...props
}: IInputProps) => (
  <InputPrimitive
    type={type}
    data-slot="input"
    aria-invalid={ariaInvalid}
    {...stylex.props(
      styles.root,
      ariaInvalid && ariaInvalid !== 'false' && styles.ariaInvalid,
    )}
    {...props}
  />
);

export { Input };
