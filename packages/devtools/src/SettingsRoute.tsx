import type { CSSProperties } from "react";

import { useStore } from "zustand/react";

import { devtoolsStore } from "./store.js";
import type { IKeyboardKey } from "./types.js";
import { uppercaseFirstLetter } from "./utils/sanitize.js";

const styles: Record<string, CSSProperties> = {
  root: {
    height: "100%",
    overflowY: "auto",
    padding: 16,
    boxSizing: "border-box",
    fontFamily: "system-ui, sans-serif",
  },
  section: {
    maxWidth: 720,
    marginBottom: 24,
    paddingBottom: 20,
    borderBottom: "1px solid #e5e7eb",
  },
  title: {
    margin: "0 0 4px",
    fontSize: 15,
    fontWeight: 600,
  },
  description: {
    margin: "0 0 12px",
    fontSize: 12,
    color: "#6b7280",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
    marginBottom: 12,
    fontSize: 12,
  },
  checkbox: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 12,
    fontSize: 12,
  },
  fieldDescription: {
    display: "block",
    color: "#6b7280",
    fontSize: 11,
  },
  control: {
    minWidth: 220,
    minHeight: 30,
    padding: "4px 8px",
    border: "1px solid #d1d5db",
    borderRadius: 4,
    backgroundColor: "transparent",
    color: "inherit",
    fontFamily: "inherit",
    fontSize: 12,
  },
  modifierRow: {
    display: "flex",
    gap: 6,
    marginBottom: 8,
  },
  modifier: {
    minHeight: 28,
    padding: "3px 8px",
    border: "1px solid #9ca3af",
    borderRadius: 4,
    backgroundColor: "transparent",
    color: "inherit",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 11,
  },
};

/*
 * 1. Read the persisted shell settings directly from the vanilla store.
 * 2. Update each general, URL, keyboard, and position setting in place.
 * 3. Keep the existing modifier-plus-key hotkey editing behavior.
 * 4. Omit the removed Source Inspector configuration entirely.
 */
export function SettingsRoute() {
  const settings = useStore(devtoolsStore, (state) => state.settings);
  const modifiers: Array<IKeyboardKey> = ["CtrlOrMeta", "Alt", "Shift"];

  // 3 — this policy is reused by the three explicit modifier buttons below.
  const toggleModifier = (modifier: IKeyboardKey) => {
    if (settings.openHotkey.includes(modifier)) {
      devtoolsStore.setState((state) => ({
        ...state,
        settings: {
          ...state.settings,
          openHotkey: state.settings.openHotkey.filter(
            (key) => key !== modifier,
          ),
        },
      }));
      return;
    }

    const existingModifiers = settings.openHotkey.filter((key) =>
      modifiers.includes(key),
    );
    const otherKeys = settings.openHotkey.filter(
      (key) => !modifiers.includes(key),
    );
    devtoolsStore.setState((state) => ({
      ...state,
      settings: {
        ...state.settings,
        openHotkey: [...existingModifiers, modifier, ...otherKeys],
      },
    }));
  };

  const handleKeyInput = (input: string) => {
    const hotkeyModifiers = settings.openHotkey.filter((key) =>
      modifiers.includes(key),
    );
    const newKeys = input
      .split("+")
      .flatMap((key) => {
        if (key.length === 1) {
          return [uppercaseFirstLetter(key)];
        }

        const characters: Array<string> = [];
        for (const character of key) {
          const letter = uppercaseFirstLetter(character);
          if (!characters.includes(letter)) {
            characters.push(letter);
          }
        }
        return characters;
      })
      .filter(Boolean);

    devtoolsStore.setState((state) => ({
      ...state,
      settings: {
        ...state.settings,
        openHotkey: [...hotkeyModifiers, ...newKeys],
      },
    }));
  };

  const nonModifierValue = settings.openHotkey
    .filter((key) => !modifiers.includes(key))
    .join("+");

  return (
    <div style={styles.root}>
      <section style={styles.section}>
        <h2 style={styles.title}>General</h2>
        <p style={styles.description}>
          Configure general behavior of the DevTools panel.
        </p>

        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={settings.defaultOpen}
            onChange={() =>
              devtoolsStore.setState((state) => ({
                ...state,
                settings: {
                  ...state.settings,
                  defaultOpen: !state.settings.defaultOpen,
                },
              }))
            }
          />
          <span>
            Default open
            <span style={styles.fieldDescription}>
              Automatically open DevTools when the page loads.
            </span>
          </span>
        </label>

        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={settings.hideUntilHover}
            onChange={() =>
              devtoolsStore.setState((state) => ({
                ...state,
                settings: {
                  ...state.settings,
                  hideUntilHover: !state.settings.hideUntilHover,
                },
              }))
            }
          />
          <span>
            Hide trigger until hovered
            <span style={styles.fieldDescription}>
              Keep the trigger transparent until its area is hovered.
            </span>
          </span>
        </label>

        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={settings.triggerHidden}
            onChange={() =>
              devtoolsStore.setState((state) => ({
                ...state,
                settings: {
                  ...state.settings,
                  triggerHidden: !state.settings.triggerHidden,
                },
              }))
            }
          />
          <span>
            Completely hide trigger
            <span style={styles.fieldDescription}>
              The open/close hotkey remains available.
            </span>
          </span>
        </label>

        <label style={styles.field}>
          Theme
          <select
            style={styles.control}
            value={settings.theme}
            onChange={(event) => {
              const theme =
                event.currentTarget.value === "dark" ? "dark" : "light";
              devtoolsStore.setState((state) => ({
                ...state,
                settings: { ...state.settings, theme },
              }));
            }}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
      </section>

      <section style={styles.section}>
        <h2 style={styles.title}>URL Configuration</h2>
        <p style={styles.description}>
          Control whether DevTools is available from a URL flag.
        </p>

        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={settings.requireUrlFlag}
            onChange={(event) =>
              devtoolsStore.setState((state) => ({
                ...state,
                settings: {
                  ...state.settings,
                  requireUrlFlag: event.currentTarget.checked,
                },
              }))
            }
          />
          Require URL flag
        </label>

        {settings.requireUrlFlag ? (
          <label style={styles.field}>
            URL flag
            <input
              style={styles.control}
              value={settings.urlFlag}
              placeholder="debug"
              onChange={(event) =>
                devtoolsStore.setState((state) => ({
                  ...state,
                  settings: {
                    ...state.settings,
                    urlFlag: event.currentTarget.value,
                  },
                }))
              }
            />
          </label>
        ) : null}
      </section>

      <section style={styles.section}>
        <h2 style={styles.title}>Keyboard</h2>
        <p style={styles.description}>Customize the open/close shortcut.</p>

        <div style={styles.modifierRow}>
          <button
            type="button"
            style={{
              ...styles.modifier,
              backgroundColor: settings.openHotkey.includes("CtrlOrMeta")
                ? "#dcfce7"
                : "transparent",
            }}
            onClick={() => toggleModifier("CtrlOrMeta")}
          >
            Ctrl Or Meta
          </button>
          <button
            type="button"
            style={{
              ...styles.modifier,
              backgroundColor: settings.openHotkey.includes("Alt")
                ? "#dcfce7"
                : "transparent",
            }}
            onClick={() => toggleModifier("Alt")}
          >
            Alt
          </button>
          <button
            type="button"
            style={{
              ...styles.modifier,
              backgroundColor: settings.openHotkey.includes("Shift")
                ? "#dcfce7"
                : "transparent",
            }}
            onClick={() => toggleModifier("Shift")}
          >
            Shift
          </button>
        </div>

        <label style={styles.field}>
          Keys
          <input
            style={styles.control}
            value={nonModifierValue}
            placeholder="~"
            onChange={(event) => handleKeyInput(event.currentTarget.value)}
          />
          <span style={styles.fieldDescription}>
            Final shortcut: {settings.openHotkey.join(" + ")}
          </span>
        </label>
      </section>

      <section style={{ ...styles.section, borderBottom: "none" }}>
        <h2 style={styles.title}>Position</h2>
        <p style={styles.description}>
          Adjust the trigger and panel placement.
        </p>

        <label style={styles.field}>
          Trigger position
          <select
            style={styles.control}
            value={settings.position}
            onChange={(event) => {
              const position = event.currentTarget.value;
              if (
                position !== "top-left" &&
                position !== "top-right" &&
                position !== "bottom-left" &&
                position !== "bottom-right" &&
                position !== "middle-left" &&
                position !== "middle-right"
              ) {
                return;
              }
              devtoolsStore.setState((state) => ({
                ...state,
                settings: { ...state.settings, position },
              }));
            }}
          >
            <option value="bottom-right">Bottom Right</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="top-right">Top Right</option>
            <option value="top-left">Top Left</option>
            <option value="middle-right">Middle Right</option>
            <option value="middle-left">Middle Left</option>
          </select>
        </label>

        <label style={styles.field}>
          Panel position
          <select
            style={styles.control}
            value={settings.panelLocation}
            onChange={(event) => {
              const panelLocation =
                event.currentTarget.value === "top" ? "top" : "bottom";
              devtoolsStore.setState((state) => ({
                ...state,
                settings: { ...state.settings, panelLocation },
              }));
            }}
          >
            <option value="bottom">Bottom</option>
            <option value="top">Top</option>
          </select>
        </label>
      </section>
    </div>
  );
}
