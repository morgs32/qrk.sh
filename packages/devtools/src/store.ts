import { createStore } from "zustand/vanilla";

import type {
  IDevtoolsStore,
  IModifierKey,
  IZerospinDevtoolsConfig,
} from "./types.js";
import { tryParseJson } from "./utils/sanitize.js";
import {
  getStorageItem,
  setStorageItem,
  ZEROSPIN_DEVTOOLS_SETTINGS,
  ZEROSPIN_DEVTOOLS_STATE,
} from "./utils/storage.js";

export const keyboardModifiers: Array<IModifierKey> = [
  "Alt",
  "Control",
  "Meta",
  "Shift",
  "CtrlOrMeta",
];

export const initialState: IDevtoolsStore = {
  settings: {
    defaultOpen: false,
    hideUntilHover: false,
    position: "bottom-right",
    panelLocation: "bottom",
    openHotkey: ["Control", "~"],
    requireUrlFlag: false,
    urlFlag: "zerospin-devtools",
    theme:
      typeof window !== "undefined" &&
      typeof window.matchMedia !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
    triggerHidden: false,
  },
  state: {
    height: 400,
    persistOpen: false,
  },
};

export function getExistingStateFromStorage(
  config?: IZerospinDevtoolsConfig,
): IDevtoolsStore {
  const existingState = tryParseJson<IDevtoolsStore["state"]>(
    getStorageItem(ZEROSPIN_DEVTOOLS_STATE),
  );
  const savedSettings = tryParseJson<IDevtoolsStore["settings"]>(
    getStorageItem(ZEROSPIN_DEVTOOLS_SETTINGS),
  );

  return {
    state: {
      height: existingState?.height ?? initialState.state.height,
      persistOpen: existingState?.persistOpen ?? initialState.state.persistOpen,
    },
    settings: {
      ...initialState.settings,
      ...config,
      ...savedSettings,
    },
  };
}

export const devtoolsStore = createStore<IDevtoolsStore>()(() =>
  getExistingStateFromStorage(),
);

devtoolsStore.subscribe((state) => {
  setStorageItem(ZEROSPIN_DEVTOOLS_SETTINGS, JSON.stringify(state.settings));
  setStorageItem(ZEROSPIN_DEVTOOLS_STATE, JSON.stringify(state.state));
});
