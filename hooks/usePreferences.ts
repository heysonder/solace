"use client";

import { useState, useEffect, useCallback } from 'react';

interface UserPreferences {
  chatFontSize?: number;
  showTimestamps?: boolean;
}

const PREFERENCES_KEY = 'solace_preferences';

// Helper to get localStorage preferences
const getPreferencesFromStorage = (): UserPreferences => {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(PREFERENCES_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Error loading preferences from localStorage:', error);
  }
  return {};
};

// Helper to save preferences to localStorage
const savePreferencesToStorage = (preferences: UserPreferences): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error('Error saving preferences to localStorage:', error);
  }
};

export function usePreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load preferences from localStorage on mount
  useEffect(() => {
    setPreferences(getPreferencesFromStorage());
    setIsLoading(false);
  }, []);

  // Update preferences
  const updatePreferences = useCallback((updates: Partial<UserPreferences>) => {
    setPreferences(prev => {
      const updated = { ...prev, ...updates };
      savePreferencesToStorage(updated);
      return updated;
    });
  }, []);

  return {
    preferences,
    isLoading,
    updatePreferences,
  };
}
