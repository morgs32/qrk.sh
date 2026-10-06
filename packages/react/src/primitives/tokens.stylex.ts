import * as stylex from '@stylexjs/stylex';

export const colors = stylex.defineConsts({
  background: 'var(--background, #ffffff)',
  foreground: 'var(--foreground, #171717)',
  primary: 'var(--primary, #171717)',
  primaryForeground: 'var(--primary-foreground, #fafafa)',
  mutedForeground: 'var(--muted-foreground, #737373)',
  input: 'var(--input, #d4d4d4)',
  ring: 'var(--ring, #737373)',
  destructive: 'var(--destructive, #dc2626)',
  popover: 'var(--popover, #ffffff)',
  popoverForeground: 'var(--popover-foreground, #171717)',
  accent: 'var(--accent, #f5f5f5)',
  accentForeground: 'var(--accent-foreground, #171717)',
});

export const radius = stylex.defineConsts({
  md: 'var(--radius, 0.375rem)',
});
