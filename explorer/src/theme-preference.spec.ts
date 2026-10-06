import { describe, expect, it } from 'vitest';

import {
  readThemePreference,
  resolveTheme,
  saveThemePreference,
  themeStorageKey,
} from './theme-preference';

describe('Explorer theme preferences', () => {
  it('follows the device when there is no valid explicit choice', () => {
    for (const stored of [null, '', 'system', 'corrupt']) {
      const preference = readThemePreference({ getItem: () => stored });
      expect(resolveTheme(preference, false)).toBe('light');
      expect(resolveTheme(preference, true)).toBe('dark');
    }
  });

  it('keeps either explicit choice when the device theme differs', () => {
    expect(
      resolveTheme(readThemePreference({ getItem: () => 'light' }), true),
    ).toBe('light');
    expect(
      resolveTheme(readThemePreference({ getItem: () => 'dark' }), false),
    ).toBe('dark');
  });

  it('uses the device and keeps switching available when storage is blocked', () => {
    const storage = {
      getItem: () => {
        throw new Error('Storage blocked');
      },
      setItem: () => {
        throw new Error('Storage blocked');
      },
    };
    expect(resolveTheme(readThemePreference(storage), true)).toBe('dark');
    expect(() => saveThemePreference(storage, 'light')).not.toThrow();
  });

  it('persists explicit choices under the app-specific key', () => {
    const saved = new Map<string, string>();
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => {
        saved.set(key, value);
      },
    };
    saveThemePreference(storage, 'dark');
    expect(saved.get(themeStorageKey)).toBe('dark');
    expect(readThemePreference(storage)).toBe('dark');
  });
});
