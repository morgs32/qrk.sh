import type { ComponentProps } from 'react';

type LinkProps = ComponentProps<'a'> & {
  underlined?: boolean;
  withIcon?: boolean;
};

export function Link({
  className,
  children,
  underlined = true,
  withIcon = false,
  ...props
}: LinkProps) {
  const classes = [underlined && 'underlined-link', className]
    .filter(Boolean)
    .join(' ');

  return (
    <a {...props} className={classes || undefined}>
      {children}
      {withIcon && (
        <>
          {' '}
          <span aria-hidden="true">
            {/^https?:/i.test(props.href ?? '') ? '↗' : '→'}
          </span>
        </>
      )}
    </a>
  );
}
