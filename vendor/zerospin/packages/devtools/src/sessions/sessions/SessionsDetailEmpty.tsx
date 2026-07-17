import type { CSSProperties } from "react";

const styles = {
  detailEmpty: {
    margin: 0,
    opacity: 0.7,
    padding: 8,
  } satisfies CSSProperties,
} as const;

export function SessionsDetailEmpty() {
  return (
    <p style={styles.detailEmpty}>
      Register a session from inside your session provider via
      zerospinDevtoolsStore.
    </p>
  );
}
