import type { ReactNode } from "react";

export function InlineData({ entries }: { entries: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="m-0 font-mono text-sm leading-5 text-zinc-900">
      {entries.map((entry) => (
        <div key={entry.label} className="break-words">
          <dt className="inline text-zinc-400">{entry.label}: </dt>
          <dd className="m-0 inline">{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}
