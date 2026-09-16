import type { ReactNode } from "react";

export function TableData({ entries }: { entries: { label: string; value: ReactNode }[] }) {
  return (
    <table className="w-full max-w-[500px] border-collapse border border-zinc-200 font-mono">
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.label} className="border-b border-zinc-200 last:border-b-0">
            <th
              scope="row"
              className="border-r border-zinc-200 py-1 pl-1.25 pr-1.5 text-left align-top font-normal"
            >
              {entry.label}
            </th>
            <td className="break-words py-1 pl-1.5 align-top">{entry.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
