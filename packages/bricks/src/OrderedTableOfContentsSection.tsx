import type { ReactNode } from "react";

export function OrderedTableOfContentsSection({
  label,
  children,
  number,
}: {
  label: ReactNode;
  children?: ReactNode;
  number?: number;
}) {
  return (
    <div
      className="[counter-increment:toc-section]"
      style={number === undefined ? undefined : { counterSet: `toc-section ${number - 1}` }}
    >
      <div className="flex items-baseline gap-[1ch] before:shrink-0 before:text-zinc-400 before:content-[counter(toc-section)]">
        <span className="min-w-0 break-words">{label}</span>
      </div>
      {children != null && (
        <ol type="A" className="my-5 ml-[2ch] list-none p-0 [counter-reset:toc-item]">
          {children}
        </ol>
      )}
    </div>
  );
}
