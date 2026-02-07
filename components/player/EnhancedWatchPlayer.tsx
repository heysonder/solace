"use client";

import { useState, useCallback } from 'react';
import NativeHlsPlayer from './NativeHlsPlayer';
import TwitchIframePlayer from './TwitchIframePlayer';

interface EnhancedWatchPlayerProps {
  channel: string;
  parent: string;
}

export default function EnhancedWatchPlayer({ channel, parent }: EnhancedWatchPlayerProps) {
  const [useFallback, setUseFallback] = useState(false);

  const handleFallback = useCallback(() => {
    console.warn('[EnhancedWatchPlayer] Native player failed, falling back to iframe');
    setUseFallback(true);
  }, []);

  return (
    <div className="relative w-full aspect-video bg-black overflow-hidden shadow-2xl rounded-xl">
      {useFallback ? (
        <TwitchIframePlayer channel={channel} parent={parent} />
      ) : (
        <NativeHlsPlayer channel={channel} onFallback={handleFallback} />
      )}
    </div>
  );
}
