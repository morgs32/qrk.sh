import type { CSSProperties } from "react";

import { NavLink, Outlet } from "react-router";

import { useProfileForRoute } from "./useProfileForRoute";

const styles = {
  paneRoot: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
  tabsHeader: {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    backgroundColor: "#f3f4f6",
    borderBottom: "1px solid #e5e7eb",
  } satisfies CSSProperties,
  tab: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 500,
    border: "none",
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    marginBottom: -1,
    backgroundColor: "transparent",
    cursor: "pointer",
    color: "#6b7280",
    fontFamily: "inherit",
    textDecoration: "none",
  } satisfies CSSProperties,
  tabActive: {
    borderBottomColor: "#3b82f6",
    color: "#111827",
  } satisfies CSSProperties,
  tabContent: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
} as const;

function FileJsonIcon(props: { readonly color: string }) {
  const { color } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 12h4" />
      <path d="M10 16h7" />
    </svg>
  );
}

export function ProfilePane() {
  const profile = useProfileForRoute();

  if (profile === undefined) {
    return (
      <p
        style={{
          margin: 0,
          padding: 8,
          fontSize: "0.85rem",
          color: "#6b7280",
        }}
      >
        Profile not found.
      </p>
    );
  }

  return (
    <div style={styles.paneRoot}>
      <div style={styles.tabsHeader}>
        <NavLink
          to="props"
          style={({ isActive }) => ({
            ...styles.tab,
            ...(isActive ? styles.tabActive : {}),
          })}
        >
          <FileJsonIcon color="#3b82f6" />
          Props
        </NavLink>
      </div>
      <div style={styles.tabContent}>
        <Outlet />
      </div>
    </div>
  );
}
