function getBrowserLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const getStorageItem = (key: string) =>
  getBrowserLocalStorage()?.getItem(key) ?? null;

export const setStorageItem = (key: string, value: string) => {
  try {
    getBrowserLocalStorage()?.setItem(key, value);
  } catch {
    return;
  }
};

export const ZEROSPIN_DEVTOOLS = 'zerospin_devtools';
export const ZEROSPIN_DEVTOOLS_STATE = 'zerospin_devtools_state';
export const ZEROSPIN_DEVTOOLS_SETTINGS = 'zerospin_devtools_settings';
