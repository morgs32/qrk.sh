import type { ComponentPropsWithRef, ReactNode } from 'react';

export function Outline({
  muted = false,
  className,
  ...props
}: ComponentPropsWithRef<'ol'> & { muted?: boolean }) {
  return (
    <ol
      {...props}
      className={`fragment-outline${muted ? ' fragment-outline-muted' : ''}${className ? ` ${className}` : ''}`}
    />
  );
}

export function OutlineItem({
  label,
  className,
  children,
  ...props
}: ComponentPropsWithRef<'li'> & { label: ReactNode }) {
  return (
    <li
      {...props}
      className={`fragment-outline-item${className ? ` ${className}` : ''}`}
    >
      <div className="fragment-outline-label">{label}</div>
      {children != null && typeof children !== 'boolean' && (
        <div className="fragment-outline-body">{children}</div>
      )}
    </li>
  );
}
