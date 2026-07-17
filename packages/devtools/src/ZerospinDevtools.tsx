"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { createPortal } from "react-dom";
import {
  MemoryRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
} from "react-router";
import { useStore } from "zustand/react";

import { ProfilePane } from "./profiler/profileId/ProfilePane.js";
import { ProfilePropsTab } from "./profiler/profileId/ProfilePropsTab.js";
import { ProfilerDetailEmpty } from "./profiler/ProfilerDetailEmpty.js";
import { ProfilerLayout } from "./profiler/ProfilerLayout.js";
import { SessionsCommandsLayout } from "./sessions/sessions/sessionId/commands/SessionsCommandsLayout.js";
import { SessionsCommandsExecutedRoute } from "./sessions/sessions/sessionId/commands/executed/SessionsCommandsExecutedRoute.js";
import { SessionsCommandsFailedRoute } from "./sessions/sessions/sessionId/commands/failed/SessionsCommandsFailedRoute.js";
import { SessionsCommandsPushedRoute } from "./sessions/sessions/sessionId/commands/pushed/SessionsCommandsPushedRoute.js";
import { SessionsCommandsStagedRoute } from "./sessions/sessions/sessionId/commands/staged/SessionsCommandsStagedRoute.js";
import { SessionsDatabaseIndexRoute } from "./sessions/sessions/sessionId/database/SessionsDatabaseIndexRoute.js";
import { SessionsDatabaseLayout } from "./sessions/sessions/sessionId/database/SessionsDatabaseLayout.js";
import { SessionsDatabaseModelRoute } from "./sessions/sessions/sessionId/database/SessionsDatabaseModelRoute.js";
import { SessionsLogsRoute } from "./sessions/sessions/sessionId/logs/SessionsLogsRoute.js";
import { SessionLayout } from "./sessions/sessions/sessionId/SessionLayout.js";
import { SessionPane } from "./sessions/sessions/sessionId/SessionPane.js";
import { SessionsDetailEmpty } from "./sessions/sessions/SessionsDetailEmpty.js";
import { SessionsLayout } from "./sessions/sessions/SessionsLayout.js";
import { SettingsRoute } from "./SettingsRoute.js";
import { SharedWorkerRoute } from "./sharedWorker/SharedWorkerRoute.js";
import { tokens } from "./styles/tokens.js";
import { devtoolsStore, getExistingStateFromStorage } from "./store.js";
import type { IZerospinDevtoolsConfig } from "./types.js";
import { isHotkeyCombinationPressed } from "./utils/hotkey.js";
import { ZEROSPIN_DEVTOOLS } from "./utils/storage.js";
import triggerLogo from "./components/triggerLogo.js";

function DevtoolsNavigation(props: {
  isDetached: boolean;
  onClose: () => void;
  onDetach: () => void;
}) {
  const { isDetached, onClose, onDetach } = props;
  const settings = useStore(devtoolsStore, (state) => state.settings);
  const isDark = settings.theme === "dark";
  const foreground = isDark ? tokens.colors.gray[300] : tokens.colors.gray[600];
  const activeForeground = isDark
    ? tokens.colors.gray[100]
    : tokens.colors.gray[900];
  const activeBackground = isDark
    ? tokens.colors.gray[800]
    : tokens.colors.gray[100];
  const borderColor = isDark
    ? tokens.colors.gray[800]
    : tokens.colors.gray[200];

  const textNavigationStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    height: 32,
    padding: "0 12px",
    boxSizing: "border-box",
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    color: foreground,
    backgroundColor: "transparent",
    fontFamily: "system-ui, sans-serif",
    fontSize: 11,
    fontWeight: 600,
    textDecoration: "none",
  };

  const iconControlStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    flexShrink: 0,
    padding: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 2,
    borderLeftWidth: 0,
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    color: foreground,
    backgroundColor: "transparent",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
    >
      <header
        data-testid="zerospin-devtools-toolbar"
        style={{
          display: "flex",
          alignItems: "stretch",
          justifyContent: "space-between",
          height: 32,
          flexShrink: 0,
          borderBottomWidth: 1,
          borderBottomStyle: "solid",
          borderBottomColor: borderColor,
          backgroundColor: isDark
            ? tokens.colors.darkGray[900]
            : tokens.colors.gray[50],
        }}
      >
        <nav aria-label="Zerospin DevTools" style={{ display: "flex" }}>
          <NavLink
            to="/sessions"
            style={({ isActive }) => ({
              ...textNavigationStyle,
              ...(isActive
                ? {
                    color: activeForeground,
                    backgroundColor: activeBackground,
                    borderBottomColor: activeForeground,
                  }
                : {}),
            })}
          >
            Sessions
          </NavLink>
          <NavLink
            to="/profiler"
            style={({ isActive }) => ({
              ...textNavigationStyle,
              ...(isActive
                ? {
                    color: activeForeground,
                    backgroundColor: activeBackground,
                    borderBottomColor: activeForeground,
                  }
                : {}),
            })}
          >
            Profiler
          </NavLink>
          <NavLink
            to="/shared-worker"
            style={({ isActive }) => ({
              ...textNavigationStyle,
              ...(isActive
                ? {
                    color: activeForeground,
                    backgroundColor: activeBackground,
                    borderBottomColor: activeForeground,
                  }
                : {}),
            })}
          >
            Shared Worker
          </NavLink>
        </nav>

        <div
          data-testid="zerospin-devtools-native-controls"
          style={{ display: "flex", marginLeft: "auto" }}
        >
          <NavLink
            to="/settings"
            aria-label="Settings"
            data-testid="zerospin-devtools-settings"
            style={({ isActive }) => ({
              ...iconControlStyle,
              ...(isActive
                ? {
                    color: activeForeground,
                    backgroundColor: activeBackground,
                    borderBottomColor: activeForeground,
                  }
                : {}),
            })}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
              <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
              <path d="M12 2v2" />
              <path d="M12 22v-2" />
              <path d="m17 20.66-1-1.73" />
              <path d="M11 10.27 7 3.34" />
              <path d="m20.66 17-1.73-1" />
              <path d="m3.34 7 1.73 1" />
              <path d="M14 12h8" />
              <path d="M2 12h2" />
              <path d="m20.66 7-1.73 1" />
              <path d="m3.34 17 1.73-1" />
              <path d="m17 3.34-1 1.73" />
              <path d="m11 13.73-4 6.93" />
            </svg>
          </NavLink>

          {isDetached ? null : (
            <button
              type="button"
              aria-label="Open DevTools in a separate window"
              data-testid="zerospin-devtools-pip"
              style={iconControlStyle}
              onClick={onDetach}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M2 10h6V4" />
                <path d="m2 4 6 6" />
                <path d="M21 10V7a2 2 0 0 0-2-2h-7" />
                <path d="M3 14v2a2 2 0 0 0 2 2h3" />
                <rect x="12" y="14" width="10" height="7" rx="1" />
              </svg>
            </button>
          )}

          {isDetached ? null : (
            <button
              type="button"
              aria-label="Close Zerospin DevTools"
              data-testid="zerospin-devtools-close"
              style={iconControlStyle}
              onClick={onClose}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <main style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Outlet />
      </main>
    </div>
  );
}

function DevtoolsRoutes(props: {
  isDetached: boolean;
  onClose: () => void;
  onDetach: () => void;
}) {
  const { isDetached, onClose, onDetach } = props;

  return (
    <Routes>
      <Route
        element={
          <DevtoolsNavigation
            isDetached={isDetached}
            onClose={onClose}
            onDetach={onDetach}
          />
        }
      >
        <Route path="/sessions" element={<SessionsLayout />}>
          <Route index element={<SessionsDetailEmpty />} />
          <Route path=":sessionId" element={<SessionLayout />}>
            <Route
              index
              element={<Navigate to="commands" replace relative="path" />}
            />
            <Route element={<SessionPane />}>
              <Route path="commands" element={<SessionsCommandsLayout />}>
                <Route
                  index
                  element={<Navigate to="staged" replace relative="path" />}
                />
                <Route
                  path="staged"
                  element={<SessionsCommandsStagedRoute />}
                />
                <Route
                  path="pushed"
                  element={<SessionsCommandsPushedRoute />}
                />
                <Route
                  path="failed"
                  element={<SessionsCommandsFailedRoute />}
                />
                <Route
                  path="executed"
                  element={<SessionsCommandsExecutedRoute />}
                />
              </Route>
              <Route path="database" element={<SessionsDatabaseLayout />}>
                <Route index element={<SessionsDatabaseIndexRoute />} />
                <Route
                  path=":modelName"
                  element={<SessionsDatabaseModelRoute />}
                />
              </Route>
              <Route path="logs" element={<SessionsLogsRoute />} />
            </Route>
          </Route>
        </Route>

        <Route path="/profiler" element={<ProfilerLayout />}>
          <Route index element={<ProfilerDetailEmpty />} />
          <Route path=":profileId" element={<Outlet />}>
            <Route
              index
              element={<Navigate to="props" replace relative="path" />}
            />
            <Route element={<ProfilePane />}>
              <Route path="props" element={<ProfilePropsTab />} />
            </Route>
          </Route>
        </Route>

        <Route path="/shared-worker" element={<SharedWorkerRoute />} />
        <Route path="/settings" element={<SettingsRoute />} />
        <Route path="*" element={<Navigate to="/sessions" replace />} />
      </Route>
    </Routes>
  );
}

/*
 * 1. Hydrate the persisted shell settings after the client mount.
 * 2. Keep one memory router mounted for this component instance.
 * 3. Toggle the panel from the built-in trigger, Escape, or configured hotkey.
 * 4. Resize the panel from the edge nearest the host application.
 * 5. Move the same routed React tree into a detached popup when requested.
 * 6. Preserve route memory while closed and reset to Sessions on remount.
 */
export function ZerospinDevtools({
  config,
}: {
  config?: IZerospinDevtoolsConfig;
} = {}) {
  const [initialStoreState] = useState(() =>
    getExistingStateFromStorage(config),
  );
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(
    initialStoreState.settings.defaultOpen ||
      initialStoreState.state.persistOpen,
  );
  const [isResizing, setIsResizing] = useState(false);
  const [isTriggerHovered, setIsTriggerHovered] = useState(false);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const pipWindowRef = useRef<Window | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const settings = useStore(devtoolsStore, (state) => state.settings);
  const height = useStore(devtoolsStore, (state) => state.state.height);

  // 1 — config remains fixed for the lifetime of this mounted shell.
  useEffect(() => {
    devtoolsStore.setState(initialStoreState, true);
    setIsMounted(true);

    const closePopup = () => {
      pipWindowRef.current?.close();
      pipWindowRef.current = null;
    };

    window.addEventListener("beforeunload", closePopup);

    return () => {
      window.removeEventListener("beforeunload", closePopup);
      closePopup();
    };
  }, [initialStoreState]);

  useEffect(() => {
    document.documentElement.dataset.zerospinDevtoolsTheme = settings.theme;
  }, [settings.theme]);

  const toggleOpen = useCallback(() => {
    const nextIsOpen = !isOpen;
    setIsOpen(nextIsOpen);
    devtoolsStore.setState((state) => ({
      ...state,
      state: {
        ...state.state,
        persistOpen: nextIsOpen,
      },
    }));
  }, [isOpen]);

  // 3 — one document listener handles Escape and the configured shortcut.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        toggleOpen();
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.getAttribute("role") === "textbox")
      ) {
        return;
      }

      const pressedKeys: Array<string> = [];
      if (event.altKey) {
        pressedKeys.push("Alt");
      }
      if (event.ctrlKey) {
        pressedKeys.push("Control");
      }
      if (event.metaKey) {
        pressedKeys.push("Meta");
      }
      if (event.shiftKey) {
        pressedKeys.push("Shift");
      }
      pressedKeys.push(event.key);

      if (isHotkeyCombinationPressed(pressedKeys, settings.openHotkey)) {
        event.preventDefault();
        toggleOpen();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, settings.openHotkey, toggleOpen]);

  // 4 — drag direction follows whether the panel is attached to the top or bottom.
  const handleDragStart = (startEvent: ReactMouseEvent<HTMLDivElement>) => {
    if (startEvent.button !== 0 || panelRef.current === null) {
      return;
    }

    const ownerWindow =
      startEvent.currentTarget.ownerDocument.defaultView ?? window;
    const originalHeight = panelRef.current.getBoundingClientRect().height;
    const startPageY = startEvent.pageY;
    setIsResizing(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startPageY - moveEvent.pageY;
      const nextHeight =
        settings.panelLocation === "bottom"
          ? originalHeight + delta
          : originalHeight - delta;

      devtoolsStore.setState((state) => ({
        ...state,
        state: { ...state.state, height: nextHeight },
      }));

      if (nextHeight < 70) {
        setIsOpen(false);
      } else {
        setIsOpen(true);
      }
    };

    const onMouseUp = () => {
      setIsResizing(false);
      ownerWindow.removeEventListener("mousemove", onMouseMove);
      ownerWindow.removeEventListener("mouseup", onMouseUp);
    };

    ownerWindow.addEventListener("mousemove", onMouseMove);
    ownerWindow.addEventListener("mouseup", onMouseUp);
  };

  // 5 — copy host styles before portaling the existing routed tree into the popup.
  const requestPipWindow = () => {
    if (pipWindowRef.current !== null) {
      return;
    }

    const popup = window.open(
      "",
      "Zerospin-Devtools-Panel",
      `width=${window.innerWidth},height=${height},top=${window.screen.height},left=${window.screenLeft},popup`,
    );

    if (popup === null) {
      throw new Error(
        "Failed to open popup. Please allow popups for this site to view Zerospin DevTools in picture-in-picture mode.",
      );
    }

    popup.document.head.innerHTML = "";
    popup.document.body.innerHTML = "";
    popup.document.title = "Zerospin DevTools";
    popup.document.body.style.margin = "0";

    [...document.styleSheets].forEach((styleSheet) => {
      try {
        const cssRules = [...styleSheet.cssRules]
          .map((rule) => rule.cssText)
          .join("");
        const style = popup.document.createElement("style");
        style.textContent = cssRules;
        popup.document.head.appendChild(style);
      } catch {
        if (styleSheet.href === null) {
          return;
        }
        const link = popup.document.createElement("link");
        link.rel = "stylesheet";
        link.type = styleSheet.type;
        link.media = styleSheet.media.toString();
        link.href = styleSheet.href;
        popup.document.head.appendChild(link);
      }
    });

    popup.addEventListener("pagehide", () => {
      pipWindowRef.current = null;
      setPipWindow(null);
    });

    pipWindowRef.current = popup;
    setPipWindow(popup);
  };

  if (!isMounted) {
    return null;
  }

  const isAvailable = settings.requireUrlFlag
    ? window.location.search.includes(settings.urlFlag)
    : true;
  const isDark = settings.theme === "dark";
  const portalTarget = pipWindow?.document.body ?? document.body;

  const triggerPositionStyle: CSSProperties = {};
  if (settings.position === "top-left") {
    triggerPositionStyle.top = 16;
    triggerPositionStyle.left = 16;
  }
  if (settings.position === "top-right") {
    triggerPositionStyle.top = 16;
    triggerPositionStyle.right = 16;
  }
  if (settings.position === "middle-left") {
    triggerPositionStyle.top = "50%";
    triggerPositionStyle.left = 16;
    triggerPositionStyle.transform = "translateY(-50%)";
  }
  if (settings.position === "middle-right") {
    triggerPositionStyle.top = "50%";
    triggerPositionStyle.right = 16;
    triggerPositionStyle.transform = "translateY(-50%)";
  }
  if (settings.position === "bottom-left") {
    triggerPositionStyle.bottom = 16;
    triggerPositionStyle.left = 16;
  }
  if (settings.position === "bottom-right") {
    triggerPositionStyle.bottom = 16;
    triggerPositionStyle.right = 16;
  }

  const panelPositionStyle: CSSProperties = {};
  if (settings.panelLocation === "top") {
    panelPositionStyle.top = 0;
  } else {
    panelPositionStyle.bottom = 0;
  }

  return (
    <MemoryRouter initialEntries={["/sessions"]}>
      {createPortal(
        <div data-testid={ZEROSPIN_DEVTOOLS}>
          {isAvailable && !settings.triggerHidden && !isOpen ? (
            <button
              type="button"
              aria-label="Open Zerospin DevTools"
              onMouseEnter={() => setIsTriggerHovered(true)}
              onMouseLeave={() => setIsTriggerHovered(false)}
              onClick={toggleOpen}
              style={{
                ...triggerPositionStyle,
                position: "fixed",
                zIndex: 100000,
                width: 36,
                height: 36,
                padding: 0,
                border: "none",
                borderRadius: "50%",
                backgroundColor: "transparent",
                cursor: "pointer",
                opacity: settings.hideUntilHover && !isTriggerHovered ? 0 : 1,
                transition: "opacity 150ms ease",
              }}
            >
              <img
                src={triggerLogo}
                alt=""
                width={36}
                height={36}
                style={{ display: "block", borderRadius: "50%" }}
              />
            </button>
          ) : null}

          {isAvailable ? (
            <section
              id={ZEROSPIN_DEVTOOLS}
              ref={panelRef}
              aria-label="Zerospin DevTools"
              style={{
                ...panelPositionStyle,
                position: pipWindow === null ? "fixed" : "relative",
                right: 0,
                zIndex: 99999,
                display: "flex",
                width: "100%",
                height: pipWindow === null ? height : "100vh",
                maxHeight: pipWindow === null ? "90vh" : "100vh",
                boxSizing: "border-box",
                overflow: "hidden",
                color: isDark
                  ? tokens.colors.gray[100]
                  : tokens.colors.gray[900],
                backgroundColor: isDark
                  ? tokens.colors.darkGray[800]
                  : tokens.colors.white,
                borderTop:
                  settings.panelLocation === "bottom"
                    ? `1px solid ${isDark ? tokens.colors.gray[800] : tokens.colors.gray[200]}`
                    : "none",
                borderBottom:
                  settings.panelLocation === "top"
                    ? `1px solid ${isDark ? tokens.colors.gray[800] : tokens.colors.gray[200]}`
                    : "none",
                transform:
                  isOpen || pipWindow !== null
                    ? "translateY(0)"
                    : settings.panelLocation === "bottom"
                      ? "translateY(100%)"
                      : "translateY(-100%)",
                visibility: isOpen || pipWindow !== null ? "visible" : "hidden",
                pointerEvents: isOpen || pipWindow !== null ? "auto" : "none",
                transition: isResizing ? "none" : "transform 400ms ease",
              }}
            >
              <div
                role="separator"
                tabIndex={0}
                aria-orientation="horizontal"
                onMouseDown={handleDragStart}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: settings.panelLocation === "bottom" ? 0 : undefined,
                  bottom: settings.panelLocation === "top" ? 0 : undefined,
                  zIndex: 2,
                  height: 4,
                  cursor: "ns-resize",
                }}
              />
              <DevtoolsRoutes
                isDetached={pipWindow !== null}
                onClose={toggleOpen}
                onDetach={requestPipWindow}
              />
            </section>
          ) : null}
        </div>,
        portalTarget,
      )}
    </MemoryRouter>
  );
}
