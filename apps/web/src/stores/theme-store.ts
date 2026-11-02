import { create } from 'zustand';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'ttt-theme';

function initialTheme(): Theme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

interface ThemeState {
  readonly theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const startTheme = initialTheme();
applyTheme(startTheme);

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: startTheme,
  setTheme: (theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage can be unavailable in private browsing; the toggle still works.
    }

    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
  },
}));
