export function DimensionBadge({ w, h }: { w: number; h: number }) {
  return (
    <span className="inline-flex rounded bg-muted px-2 py-1 text-xs font-semibold text-foreground">
      {w}×{h}
    </span>
  );
}
