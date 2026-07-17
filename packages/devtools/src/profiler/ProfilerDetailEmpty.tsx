import type { CSSProperties } from "react";

const styles = {
  detailEmpty: {
    margin: 0,
    opacity: 0.7,
    padding: 8,
    fontSize: "0.85rem",
    color: "#6b7280",
  } satisfies CSSProperties,
} as const;

export function ProfilerDetailEmpty() {
  return (
    <p style={styles.detailEmpty}>
      Profiles will be recorded here later. Select a profile from the list when
      available.
    </p>
  );
}
