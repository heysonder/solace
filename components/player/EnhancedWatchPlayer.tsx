"use client";

import { useState, useCallback, useEffect } from 'react';
import NativeHlsPlayer from './NativeHlsPlayer';
import TwitchIframePlayer from './TwitchIframePlayer';

interface EnhancedWatchPlayerProps {
  channel: string;
  parent: string;
}

export default function EnhancedWatchPlayer({ channel, parent }: EnhancedWatchPlayerProps) {
  const [useFallback, setUseFallback] = useState(false);

  // A failure on one channel should not pin the next one to the iframe.
  useEffect(() => {
    setUseFallback(false);
  }, [channel]);

  const handleFallback = useCallback(() => {
    console.warn('[EnhancedWatchPlayer] Native player failed, falling back to iframe');
    setUseFallback(true);
  }, []);

  // Everyone, subscribers included, gets the custom player: it carries no ads
  // and is the only one with rewind. The Twitch iframe is purely a fallback.
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
