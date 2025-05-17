import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { DEFAULT_SETTINGS } from '../../shared/constants';

// Settings context types
interface SettingsContextType {
  settings: typeof DEFAULT_SETTINGS;
  isLoading: boolean;
  updateSetting: <K extends keyof typeof DEFAULT_SETTINGS>(
    key: K,
    value: typeof DEFAULT_SETTINGS[K]
  ) => Promise<void>;
  resetSettings: () => Promise<void>;
}

// Create settings context
const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// Settings provider component
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<typeof DEFAULT_SETTINGS>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  
  // Load settings from the main process on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const loadedSettings = await window.electron.invoke.getSettings();
        setSettings(loadedSettings);
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSettings();
  }, []);
  
  // Update a specific setting
  const updateSetting = async <K extends keyof typeof DEFAULT_SETTINGS>(
    key: K,
    value: typeof DEFAULT_SETTINGS[K]
  ) => {
    try {
      // Send the update to the main process
      const updatedSettings = await window.electron.invoke.setSetting(key, value);
      setSettings(updatedSettings);
    } catch (error) {
      console.error(`Failed to update setting "${key}":`, error);
    }
  };
  
  // Reset all settings to defaults
  const resetSettings = async () => {
    try {
      // Loop through each default setting and apply it
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await window.electron.invoke.setSetting(key, value);
      }
      
      // Get the updated settings
      const updatedSettings = await window.electron.invoke.getSettings();
      setSettings(updatedSettings);
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  };
  
  return (
    <SettingsContext.Provider
      value={{
        settings,
        isLoading,
        updateSetting,
        resetSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

// Hook for consuming settings context
export function useSettings() {
  const context = useContext(SettingsContext);
  
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  
  return context;
}