import * as React from 'react';

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={twMerge(clsx('w-full caption-bottom text-sm', className))}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={twMerge(clsx('[&_tr]:border-b', className))}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={twMerge(clsx('[&_tr:last-child]:border-0', className))}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={twMerge(
        clsx(
          'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
          className,
        ),
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={twMerge(
        clsx(
          'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground',
          className,
        ),
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={twMerge(clsx('p-2 align-middle whitespace-nowrap', className))}
      {...props}
    />
  );
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
