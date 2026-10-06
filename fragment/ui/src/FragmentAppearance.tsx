import type { ComponentPropsWithRef } from 'react';

export function FragmentAppearance({
  theme,
  className,
  ...props
}: ComponentPropsWithRef<'div'> & { theme: 'light' | 'dark' }) {
  return (
    <div
      {...props}
      className={`fragment-appearance${className ? ` ${className}` : ''}`}
      data-theme={theme}
    />
  );
}
