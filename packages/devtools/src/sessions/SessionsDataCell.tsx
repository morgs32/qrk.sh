import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";

const styles = {
  tdCopyInner: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  } satisfies CSSProperties,
  tdCopyText: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  copyIconButton: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
    margin: 0,
    border: "none",
    borderRadius: 4,
    backgroundColor: "transparent",
    cursor: "pointer",
    color: "#6b7280",
  } satisfies CSSProperties,
  copyIconSlot: {
    width: 22,
    minHeight: 18,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } satisfies CSSProperties,
} as const;

function CopyClipboardIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width={14} height={14} x={8} y={8} rx={2} ry={2} />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckmarkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#16a34a"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function SessionsDataCell(props: {
  readonly text: string;
  readonly ariaLabel: string;
  readonly tdStyle: CSSProperties;
}) {
  const { text, ariaLabel, tdStyle } = props;
  const [cellHovered, setCellHovered] = useState(false);
  const [showCopied, setShowCopied] = useState(false);
  const copyHideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    return () => {
      clearTimeout(copyHideTimerRef.current);
    };
  }, []);

  const copyToClipboard = (event: MouseEvent) => {
    event.stopPropagation();
    void navigator.clipboard.writeText(text);
    setShowCopied(true);
    clearTimeout(copyHideTimerRef.current);
    copyHideTimerRef.current = setTimeout(() => {
      setShowCopied(false);
      copyHideTimerRef.current = undefined;
    }, 3000);
  };

  return (
    <td
      style={tdStyle}
      onMouseEnter={() => setCellHovered(true)}
      onMouseLeave={() => setCellHovered(false)}
    >
      <div style={styles.tdCopyInner}>
        <span style={styles.tdCopyText} title={text}>
          {text}
        </span>
        <div style={styles.copyIconSlot}>
          {showCopied ? (
            <span
              style={{
                ...styles.copyIconButton,
                cursor: "default",
              }}
            >
              <CheckmarkIcon />
            </span>
          ) : cellHovered ? (
            <button
              type="button"
              aria-label={ariaLabel}
              style={styles.copyIconButton}
              onClick={copyToClipboard}
            >
              <CopyClipboardIcon />
            </button>
          ) : null}
        </div>
      </div>
    </td>
  );
}
