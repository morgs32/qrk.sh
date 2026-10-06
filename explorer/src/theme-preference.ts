export type ITheme = 'light' | 'dark';

export const themeStorageKey = 'explorer-theme';

export function readThemePreference(
  storage: Pick<Storage, 'getItem'>,
): ITheme | null {
  try {
    const preference = storage.getItem(themeStorageKey);
    return preference === 'light' || preference === 'dark' ? preference : null;
  } catch {
    return null;
  }
}

export function resolveTheme(
  preference: ITheme | null,
  deviceIsDark: boolean,
): ITheme {
  return preference ?? (deviceIsDark ? 'dark' : 'light');
}

export function saveThemePreference(
  storage: Pick<Storage, 'setItem'>,
  theme: ITheme,
) {
  try {
    storage.setItem(themeStorageKey, theme);
  } catch {
    // The explicit choice still applies for this session when storage is blocked.
  }
}
