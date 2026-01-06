"use client";

import { useState, useEffect, useCallback } from 'react';

interface FollowedChannel {
  channel: string;
  displayName: string;
  followedAt: Date;
  lastLive?: Date;
}

const FOLLOWS_KEY = 'solace_follows';

// Helper to get localStorage follows
const getFollowsFromStorage = (): FollowedChannel[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(FOLLOWS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.map((f: any) => ({
        ...f,
        followedAt: new Date(f.followedAt),
        lastLive: f.lastLive ? new Date(f.lastLive) : undefined
      }));
    }
  } catch (error) {
    console.error('Error loading follows from localStorage:', error);
  }
  return [];
};

// Helper to save follows to localStorage
const saveFollowsToStorage = (follows: FollowedChannel[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FOLLOWS_KEY, JSON.stringify(follows));
  } catch (error) {
    console.error('Error saving follows to localStorage:', error);
  }
};

export function useFollows() {
  const [follows, setFollows] = useState<FollowedChannel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load follows from localStorage on mount
  useEffect(() => {
    setFollows(getFollowsFromStorage());
    setIsLoading(false);
  }, []);

  // Follow a channel
  const followChannel = useCallback((channel: string, displayName?: string) => {
    const newFollow: FollowedChannel = {
      channel: channel.toLowerCase(),
      displayName: displayName || channel,
      followedAt: new Date()
    };

    setFollows(prev => {
      // Check if already following
      if (prev.some(f => f.channel === newFollow.channel)) {
        return prev;
      }

      const updated = [...prev, newFollow].sort((a, b) =>
        b.followedAt.getTime() - a.followedAt.getTime()
      );
      saveFollowsToStorage(updated);
      return updated;
    });
  }, []);

  // Unfollow a channel
  const unfollowChannel = useCallback((channel: string) => {
    const normalizedChannel = channel.toLowerCase();

    setFollows(prev => {
      const updated = prev.filter(f => f.channel !== normalizedChannel);
      saveFollowsToStorage(updated);
      return updated;
    });
  }, []);

  // Check if following a channel
  const isFollowing = useCallback((channel: string) => {
    return follows.some(f => f.channel === channel.toLowerCase());
  }, [follows]);

  // Get follow count
  const followCount = follows.length;

  // Update last live time for a channel
  const updateLastLive = useCallback((channel: string) => {
    const normalizedChannel = channel.toLowerCase();

    setFollows(prev => {
      const updated = prev.map(f =>
        f.channel === normalizedChannel
          ? { ...f, lastLive: new Date() }
          : f
      );
      saveFollowsToStorage(updated);
      return updated;
    });
  }, []);

  return {
    follows,
    isLoading,
    followChannel,
    unfollowChannel,
    isFollowing,
    followCount,
    updateLastLive
  };
}
