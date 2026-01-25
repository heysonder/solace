"use client";

import { useState, useCallback, useEffect } from "react";
import TtvLolPlayer from "@/components/player/TtvLolPlayer";
import SafariNativePlayer from "@/components/player/SafariNativePlayer";
import { usePlatform } from "@/hooks/usePlatform";
import { STORAGE_KEYS } from "@/lib/constants/storage";

interface EnhancedWatchPlayerProps {
  channel: string;
  parent: string;
}

export default function EnhancedWatchPlayer({ channel, parent }: EnhancedWatchPlayerProps) {
  const [useFallback, setUseFallback] = useState(false);
  const [useIframePlayer, setUseIframePlayer] = useState(false);
  const [useSafariNative, setUseSafariNative] = useState(false);

  // Use the platform detection hook (runs once on mount)
  const envInfo = usePlatform();

  const handleFallback = useCallback(() => {
    console.log("EnhancedWatchPlayer: Switching to fallback player");
    setUseFallback(true);
  }, []);

  // Extract stable primitive values from envInfo to avoid re-runs when object reference changes
  const { browser, platform, media } = envInfo;
  const isSafari = browser.isSafari;
  const isMacOS = platform.isMacOS;
  const isIOS = platform.isIOS;
  const preferNativeHLS = media.preferNativeHLS;

  // Determine which player to use based on browser, platform, and user preferences
  useEffect(() => {
    const proxySelection = localStorage.getItem(STORAGE_KEYS.PROXY_SELECTION);
    const disableNativePlayer = localStorage.getItem(STORAGE_KEYS.DISABLE_NATIVE_PLAYER) === 'true';

    // Default to iframe if 'iframe' is explicitly selected
    const shouldUseIframe = proxySelection === 'iframe';
    setUseIframePlayer(shouldUseIframe);

    // Detect if we should use Safari native player
    if (!shouldUseIframe && !disableNativePlayer) {
      // Use native player for Safari on macOS or iOS (better performance)
      const shouldUseSafariNativePlayer = preferNativeHLS &&
                                          (isMacOS || isIOS) &&
                                          isSafari;

      if (process.env.NODE_ENV === 'development') {
        console.log('[EnhancedWatchPlayer] Player selection:', {
          browser: isSafari ? 'Safari' : 'Other',
          platform: platform.platformName,
          preferNativeHLS,
          useSafariNative: shouldUseSafariNativePlayer,
          proxySelection,
        });
      }

      setUseSafariNative(shouldUseSafariNativePlayer);
    } else {
      setUseSafariNative(false);
    }

    // Listen for changes to proxy selection
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.PROXY_SELECTION) {
        const newValue = e.newValue;
        setUseIframePlayer(newValue === 'iframe');

        // Re-evaluate Safari native player
        if (newValue !== 'iframe') {
          const disableNative = localStorage.getItem(STORAGE_KEYS.DISABLE_NATIVE_PLAYER) === 'true';

          setUseSafariNative(
            !disableNative &&
            preferNativeHLS &&
            (isMacOS || isIOS) &&
            isSafari
          );
        } else {
          setUseSafariNative(false);
        }
      } else if (e.key === STORAGE_KEYS.DISABLE_NATIVE_PLAYER) {
        const disabled = e.newValue === 'true';
        if (disabled) {
          setUseSafariNative(false);
        } else {
          // Re-check if we should use native player
          const proxyPref = localStorage.getItem(STORAGE_KEYS.PROXY_SELECTION);

          setUseSafariNative(
            proxyPref !== 'iframe' &&
            preferNativeHLS &&
            (isMacOS || isIOS) &&
            isSafari
          );
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [isSafari, isMacOS, isIOS, preferNativeHLS, platform.platformName]);

  // Show iframe player if user selected it OR if proxy player failed
  if (useFallback || useIframePlayer) {
    const parentDomain = parent || 'localhost';
    const iframeSrc = `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parentDomain)}&muted=false&autoplay=true&theme=dark&controls=true&quality=1080p60`;

    return (
      <div className="relative w-full aspect-video bg-black overflow-hidden shadow-2xl rounded-xl">
        <iframe
          src={iframeSrc}
          className="w-full h-full"
          allow="autoplay; fullscreen; picture-in-picture"
          sandbox="allow-same-origin allow-scripts allow-forms allow-pointer-lock allow-popups allow-storage-access-by-user-activation"
          style={{ visibility: 'visible' }}
          referrerPolicy="strict-origin-when-cross-origin"
          scrolling="no"
          frameBorder="0"
        />
      </div>
    );
  }

  // Safari Native Player - Optimized for macOS/iOS
  if (useSafariNative) {
    return (
      <div className="relative w-full">
        <SafariNativePlayer channel={channel} onError={handleFallback} />
      </div>
    );
  }

  // Default: TTV LOL PRO Player - Ad-Free Twitch Streams
  return (
    <div className="relative w-full">
      {/* TTV LOL PRO Player - Ad-Free Twitch Streams */}
      <TtvLolPlayer channel={channel} onError={handleFallback} />
    </div>
  );
}