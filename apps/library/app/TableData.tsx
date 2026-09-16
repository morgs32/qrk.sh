import type { ReactNode } from "react";

export function TableData({ entries }: { entries: { label: string; value: ReactNode }[] }) {
  return (
    <table className="w-full border-collapse font-mono">
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.label} className="border-b border-zinc-200 last:border-b-0">
            <th
              scope="row"
              className="border-r border-zinc-200 pr-3 py-2 text-left align-top font-normal"
            >
              {entry.label}
            </th>
            <td className="break-words py-2 pl-3 align-top">{entry.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
