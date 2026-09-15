export type ISiteTreeNode = {
  label: string;
  kind?: "asset" | "liability" | "income";
  children?: readonly ISiteTreeNode[];
};

function AccountTypeIcon({ kind }: { kind: "asset" | "liability" | "income" }) {
  if (kind === "asset") {
    return (
      <svg
        width="12"
        height="12"
        className="shrink-0"
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        data-testid="account-type-icon-asset"
      >
        <circle cx="6" cy="6" r="6" fill="#22c55e" />
        <path
          d="M3.98999 9.19595L4.64999 7.29995H7.32599L7.96199 9.19595H9.11399L6.66599 2.19995H5.38199L2.88599 9.19595H3.98999ZM4.94999 6.41195L6.00599 3.36395L7.02599 6.41195H4.94999Z"
          fill="#18181b"
        />
      </svg>
    );
  }

  if (kind === "liability") {
    return (
      <svg
        width="12"
        height="12"
        className="shrink-0"
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        data-testid="account-type-icon-liability"
      >
        <circle cx="6" cy="6" r="6" fill="#ef4444" />
        <path d="M4.00366 9.29678H8.95966V8.38478H5.05966V2.30078H4.00366V9.29678Z" fill="#18181b" />
      </svg>
    );
  }

  return (
    <svg
      width="12"
      height="12"
      className="shrink-0"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-testid="account-type-icon-income"
    >
      <circle cx="6" cy="6" r="6" fill="#3b82f6" />
      <path
        d="M3.82812 9.49795H8.17212V8.60995H6.50412V3.38995H8.17212V2.50195H3.82812V3.38995H5.48412V8.60995H3.82812V9.49795Z"
        fill="#18181b"
      />
    </svg>
  );
}

function flattenRows(
  nodes: readonly ISiteTreeNode[],
  ancestors: readonly string[],
): Array<{ label: string; kind?: ISiteTreeNode["kind"]; prefix: string | null }> {
  const rows: Array<{ label: string; kind?: ISiteTreeNode["kind"]; prefix: string | null }> = [];

  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const isKindRoot = ancestors.length === 0 && node.kind != null;

    if (isKindRoot) {
      rows.push({ label: node.label, kind: node.kind, prefix: null });
    } else {
      rows.push({
        label: node.label,
        kind: node.kind,
        prefix: `${ancestors.join("")}${isLast ? "└" : "├"}`,
      });
    }

    if (node.children !== undefined && node.children.length > 0) {
      const nextAncestors = isKindRoot ? [] : [...ancestors, isLast ? "  " : "│ "];
      rows.push(...flattenRows(node.children, nextAncestors));
    }
  });

  return rows;
}

export function SiteTree({
  nodes,
  highlightIndex,
}: {
  nodes: readonly ISiteTreeNode[];
  highlightIndex?: number;
}) {
  const rows = flattenRows(nodes, []);

  return (
    <div className="relative w-full pl-[1.5lh] font-mono text-sm">
      {highlightIndex !== undefined ? (
        <span
          aria-hidden="true"
          className="absolute top-0 left-0 size-3 shrink-0 rounded-full border-[0.5px] border-border transition-transform duration-500 ease-out"
          style={{ transform: `translateY(${highlightIndex}lh)` }}
        />
      ) : null}
      <div className="divide-y-[0.5px] overflow-hidden border-[0.5px] border-border bg-background">
        {rows.map((row, index) => (
          <div key={`${row.label}-${index}`} className="flex h-[1lh] items-center bg-background pl-[2px]">
            {row.prefix === null && row.kind !== undefined ? (
              <AccountTypeIcon kind={row.kind} />
            ) : (
              <span aria-hidden="true" className="pr-[1ch] pl-[12px] whitespace-pre text-muted-foreground">
                {row.prefix}
              </span>
            )}
            <span className="truncate">{row.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
