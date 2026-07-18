import type { ReactNode } from "react";

export function MetadataField(props: { label: string; children: ReactNode; className?: string }) {
  const { label, children, className } = props;

  return (
    <div className={className}>
      <dt className="text-xs font-light text-zinc-500">{label}</dt>
      <dd className="mt-1 font-semibold text-zinc-950">{children}</dd>
    </div>
  );
}
