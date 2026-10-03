import type { ReactNode } from 'react';

import './CompactTable.css';

type ICompactTableProps = {
  caption: string;
  rows: ReadonlyArray<{
    id: string;
    label: ReactNode;
    assignee?: string;
    icon?: ReactNode;
  }>;
};

export function CompactTable({ caption, rows }: ICompactTableProps) {
  const hasAssignees = rows.some((row) => row.assignee !== undefined);
  return (
    <table className="compact-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Task</th>
          {hasAssignees && <th scope="col">Assignee</th>}
          <td />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <th scope="row">{row.label}</th>
            {hasAssignees && <td>{row.assignee}</td>}
            <td className="compact-table-icon">{row.icon}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
