import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useSettings } from './useSettings';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: 'light' | 'dark';
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings, updateSetting } = useSettings();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  // Function to determine the actual theme based on the theme mode
  const determineTheme = (mode: ThemeMode): 'light' | 'dark' => {
    if (mode === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return mode;
  };
  
  // Set the theme mode
  const setThemeMode = async (mode: ThemeMode) => {
    await updateSetting('theme', mode);
  };
  
  // Effect to update the theme when settings change
  useEffect(() => {
    const currentTheme = determineTheme(settings.theme as ThemeMode);
    setTheme(currentTheme);
    
    // Apply theme to body element
    document.body.dataset.theme = currentTheme;
    
    // Listen for system theme changes if using system theme
    if (settings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      
      const handleChange = () => {
        const newTheme = mediaQuery.matches ? 'dark' : 'light';
        setTheme(newTheme);
        document.body.dataset.theme = newTheme;
      };
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [settings.theme]);
  
  // Listen for theme change events from the main process
  useEffect(() => {
    const { on, off } = window.electron;
    
    on.themeChanged((event: any, themeMode: ThemeMode) => {
      const newTheme = determineTheme(themeMode);
      setTheme(newTheme);
      document.body.dataset.theme = newTheme;
    });
    
    return () => {
      off.themeChanged();
    };
  }, []);
  
  return (
    <ThemeContext.Provider value={{ theme, themeMode: settings.theme as ThemeMode, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  
  return context;
}