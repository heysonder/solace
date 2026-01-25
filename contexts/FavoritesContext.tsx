"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { STORAGE_KEYS } from '@/lib/constants/storage';

interface FavoritesContextType {
  favorites: Set<string>;
  addFavorite: (channelLogin: string) => void;
  removeFavorite: (channelLogin: string) => void;
  isFavorite: (channelLogin: string) => boolean;
  toggleFavorite: (channelLogin: string) => void;
  isLoading: boolean;
  isSyncing: boolean;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

const FAVORITES_STORAGE_KEY = 'twitch-favorites';

// Helper to get localStorage favorites
const getFavoritesFromStorage = (): Set<string> => {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    return new Set(stored ? JSON.parse(stored) : []);
  } catch {
    return new Set();
  }
};

// Helper to save favorites to localStorage
const saveFavoritesToStorage = (favorites: Set<string>): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favorites]));
  } catch (error) {
    console.error('Failed to save favorites to localStorage:', error);
  }
};

// Check if user is authenticated
const isAuthenticated = (): boolean => {
  if (typeof window === 'undefined') return false;
  const auth = localStorage.getItem(STORAGE_KEYS.TWITCH_AUTH);
  if (!auth) return false;
  try {
    const parsed = JSON.parse(auth);
    return !!parsed?.user?.id;
  } catch {
    return false;
  }
};

interface FavoritesProviderProps {
  children: ReactNode;
}

export function FavoritesProvider({ children }: FavoritesProviderProps) {
  // Lazy initialization to prevent SSR hydration mismatch
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      return getFavoritesFromStorage();
    }
    return new Set();
  });
  const [isLoading, setIsLoading] = useState(() => typeof window === 'undefined');
  const [isSyncing, setIsSyncing] = useState(false);

  // Sync favorites from database when logged in
  const syncFromDatabase = useCallback(async () => {
    if (!isAuthenticated()) return;

    setIsSyncing(true);
    try {
      const response = await fetch('/api/user/favorites', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.favorites && Array.isArray(data.favorites)) {
          const dbFavorites = new Set(data.favorites.map((f: string) => f.toLowerCase()));
          const localFavorites = getFavoritesFromStorage();

          // Merge: combine both sets (union)
          const merged = new Set([...localFavorites, ...dbFavorites]);

          // Update local state and storage
          setFavorites(merged);
          saveFavoritesToStorage(merged);

          // If there were local-only favorites, sync them to database
          const localOnly = [...localFavorites].filter(f => !dbFavorites.has(f));
          if (localOnly.length > 0) {
            await fetch('/api/user/favorites', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ favorites: [...merged] }),
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to sync favorites from database:', error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Sync single favorite to database
  const syncToDatabase = useCallback(async (channelLogin: string, action: 'add' | 'remove') => {
    if (!isAuthenticated()) return;

    try {
      if (action === 'add') {
        await fetch('/api/user/favorites', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelLogin }),
        });
      } else {
        await fetch(`/api/user/favorites?channel=${encodeURIComponent(channelLogin)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      }
    } catch (error) {
      console.error(`Failed to ${action} favorite in database:`, error);
    }
  }, []);

  // Handle hydration and initial sync
  useEffect(() => {
    setFavorites(getFavoritesFromStorage());
    setIsLoading(false);

    // Sync from database if logged in
    syncFromDatabase();
  }, [syncFromDatabase]);

  // Listen for auth changes to trigger sync
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === FAVORITES_STORAGE_KEY) {
        setFavorites(getFavoritesFromStorage());
      }
      // If user just logged in, sync from database
      if (e.key === STORAGE_KEYS.TWITCH_AUTH && e.newValue) {
        syncFromDatabase();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [syncFromDatabase]);

  const addFavorite = useCallback((channelLogin: string) => {
    const normalizedLogin = channelLogin.toLowerCase();
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      newFavorites.add(normalizedLogin);
      saveFavoritesToStorage(newFavorites);
      return newFavorites;
    });
    // Sync to database in background
    syncToDatabase(normalizedLogin, 'add');
  }, [syncToDatabase]);

  const removeFavorite = useCallback((channelLogin: string) => {
    const normalizedLogin = channelLogin.toLowerCase();
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      newFavorites.delete(normalizedLogin);
      saveFavoritesToStorage(newFavorites);
      return newFavorites;
    });
    // Sync to database in background
    syncToDatabase(normalizedLogin, 'remove');
  }, [syncToDatabase]);

  const isFavorite = useCallback((channelLogin: string): boolean => {
    return favorites.has(channelLogin.toLowerCase());
  }, [favorites]);

  const toggleFavorite = useCallback((channelLogin: string) => {
    if (isFavorite(channelLogin)) {
      removeFavorite(channelLogin);
    } else {
      addFavorite(channelLogin);
    }
  }, [isFavorite, removeFavorite, addFavorite]);

  const value: FavoritesContextType = {
    favorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    toggleFavorite,
    isLoading,
    isSyncing,
  };

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (context === undefined) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
}
