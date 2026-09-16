import type { ReactNode } from "react";

export function MetadataField(props: { label: string; children: ReactNode; className?: string }) {
  const { label, children, className } = props;

  return (
    <div className={className}>
      <dt className="font-light">{label}</dt>
      <dd className="mt-1 font-semibold">{children}</dd>
    </div>
  );
}
