import type { ReactNode } from 'react';

import { cn } from '../lib/cn.js';

export function LeadingFieldList(props: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const { children, className } = props;

  return (
    <dl className={cn('max-w-2xl space-y-3 text-sm', className)}>{children}</dl>
  );
}

export function LeadingField(props: {
  readonly label: string;
  readonly value: ReactNode;
}) {
  const { label, value } = props;

  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <span
        aria-hidden
        className="border-muted-foreground/30 flex-1 border-b border-dotted"
      />
      <dd className="text-foreground shrink-0 font-medium font-mono">
        {value}
      </dd>
    </div>
  );
}
