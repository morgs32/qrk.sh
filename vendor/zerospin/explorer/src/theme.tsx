import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  readThemePreference,
  resolveTheme,
  saveThemePreference,
  type ITheme,
} from './theme-preference';

type IThemeContext = { theme: ITheme; setTheme: (theme: ITheme) => void };

const ThemeContext = createContext<IThemeContext | null>(null);

function readPreference() {
  try {
    return readThemePreference(window.localStorage);
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useRef(readPreference());
  const [theme, updateTheme] = useState<ITheme>(() =>
    resolveTheme(
      preference.current,
      window.matchMedia('(prefers-color-scheme: dark)').matches,
    ),
  );

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0c0a09' : '#ffffff');
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const changed = () => {
      if (preference.current === null) {
        updateTheme(resolveTheme(null, media.matches));
      }
    };
    changed();
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);

  const setTheme = (next: ITheme) => {
    preference.current = next;
    updateTheme(next);
    try {
      saveThemePreference(window.localStorage, next);
    } catch {
      // Accessing localStorage itself can fail in privacy-restricted contexts.
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('Explorer theme requires ThemeProvider');
  }
  return context;
}
