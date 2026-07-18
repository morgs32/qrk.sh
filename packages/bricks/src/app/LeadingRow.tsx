export function LeadingRow(props: { label: string; value: string }) {
  const { label, value } = props;

  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <span aria-hidden className="flex-1 border-b border-dotted border-zinc-300" />
      <dd className="shrink-0 font-mono font-medium">{value}</dd>
    </div>
  );
}
