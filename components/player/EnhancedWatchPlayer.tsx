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
  const [useSubscriberIframe, setUseSubscriberIframe] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkSubscription() {
      try {
        // Resolve the channel login to a broadcaster ID
        const channelRes = await fetch(`/api/channel/${encodeURIComponent(channel)}`);
        if (!channelRes.ok) {
          console.warn('[EnhancedWatchPlayer] Channel API returned', channelRes.status);
          return;
        }
        const channelData = await channelRes.json();
        const broadcasterId = channelData.user?.id;
        if (!broadcasterId) {
          console.warn('[EnhancedWatchPlayer] No broadcaster ID found in channel data');
          return;
        }

        // Check if the logged-in user is subscribed
        const subRes = await fetch(`/api/twitch/subscription?broadcaster_id=${broadcasterId}`);
        const subData = await subRes.json();
        console.log('[EnhancedWatchPlayer] Subscription check:', { broadcasterId, status: subRes.status, data: subData });
        if (!cancelled && subData.subscribed) {
          setUseSubscriberIframe(true);
        }
      } catch (err) {
        console.warn('[EnhancedWatchPlayer] Subscription check error:', err);
      } finally {
        if (!cancelled) {
          setCheckingSubscription(false);
        }
      }
    }

    checkSubscription();
    return () => { cancelled = true; };
  }, [channel]);

  const handleFallback = useCallback(() => {
    console.warn('[EnhancedWatchPlayer] Native player failed, falling back to iframe');
    setUseFallback(true);
  }, []);

  return (
    <div className="relative w-full aspect-video bg-black overflow-hidden shadow-2xl rounded-xl">
      {checkingSubscription ? (
        <div className="flex items-center justify-center w-full h-full">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
        </div>
      ) : useSubscriberIframe || useFallback ? (
        <TwitchIframePlayer channel={channel} parent={parent} />
      ) : (
        <NativeHlsPlayer channel={channel} onFallback={handleFallback} />
      )}
    </div>
  );
}
