import type { CSSProperties } from "react";

import { useProfileForRoute } from "./useProfileForRoute";

const styles = {
  pre: {
    margin: 0,
    padding: 12,
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    fontSize: 12,
    fontFamily: "ui-monospace, monospace",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  } satisfies CSSProperties,
} as const;

export function ProfilePropsTab() {
  const profile = useProfileForRoute();

  if (profile === undefined) {
    return null;
  }

  return <pre style={styles.pre}>{JSON.stringify(profile.props, null, 2)}</pre>;
}
