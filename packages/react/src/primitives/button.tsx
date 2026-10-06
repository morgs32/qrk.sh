import type { ComponentProps } from 'react';

// Adapted from https://www.shadcn-cssinjs.com/r/button.json. MIT: see LICENSE.shadcn-cssinjs.
import * as stylex from '@stylexjs/stylex';

import { colors, radius } from './tokens.stylex.js';

const styles = stylex.create({
  root: {
    alignItems: 'center',
    backgroundColor: {
      default: colors.primary,
      ':hover': `color-mix(in oklab, ${colors.primary} 80%, transparent)`,
    },
    borderRadius: radius.md,
    borderStyle: 'none',
    borderWidth: 0,
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 3px color-mix(in oklab, ${colors.ring} 50%, transparent)`,
    },
    color: colors.primaryForeground,
    cursor: { default: 'pointer', ':disabled': 'not-allowed' },
    display: 'inline-flex',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    fontWeight: 500,
    height: '2rem',
    justifyContent: 'center',
    opacity: { default: 1, ':disabled': 0.5 },
    outline: 'none',
    paddingInline: '0.625rem',
    transitionDuration: '150ms',
    transitionProperty: 'color, background-color, box-shadow',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  },
});

export function Button(props: ComponentProps<'button'>) {
  return (
    <button data-slot="button" {...stylex.props(styles.root)} {...props} />
  );
}
