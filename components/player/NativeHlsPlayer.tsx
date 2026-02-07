"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { usePreferNativeHLS } from '@/hooks/usePlatform';
import { initHlsPlayer, destroyHlsPlayer, getQualityLevels, setQualityLevel, type QualityLevel } from '@/lib/video/hlsPlayer';
import QualitySelector from './QualitySelector';

interface NativeHlsPlayerProps {
  channel: string;
  onFallback: () => void;
  className?: string;
}

export default function NativeHlsPlayer({ channel, onFallback, className }: NativeHlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [loading, setLoading] = useState(true);
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const preferNative = usePreferNativeHLS();

  const handleQualityChange = useCallback((index: number) => {
    if (hlsRef.current) {
      setQualityLevel(hlsRef.current, index);
      setCurrentQuality(index);
    }
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;

    let cancelled = false;

    async function setup() {
      const el = videoRef.current;
      if (!el) return;

      try {
        const res = await fetch(`/api/twitch/playback?channel=${encodeURIComponent(channel)}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `API returned ${res.status}`);
        }
        const { m3u8Url } = await res.json();
        if (cancelled) return;

        if (preferNative && el.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari: native HLS
          el.src = m3u8Url;
          el.addEventListener('loadeddata', () => {
            if (!cancelled) setLoading(false);
          }, { once: true });
          el.addEventListener('error', () => {
            if (!cancelled) onFallback();
          }, { once: true });
          el.play().catch(() => {
            // Autoplay blocked — user can click to play
          });
        } else if (Hls.isSupported()) {
          // hls.js for Chrome/Firefox/Edge
          const hls = initHlsPlayer(el, m3u8Url, () => {
            if (!cancelled) onFallback();
          });
          hlsRef.current = hls;

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelled) return;
            setLoading(false);
            setQualities(getQualityLevels(hls));
            el.play().catch(() => {});
          });

          hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
            if (!cancelled) setCurrentQuality(data.level);
          });
        } else {
          // No HLS support
          onFallback();
        }
      } catch (err) {
        console.error('[NativeHlsPlayer] Setup failed:', err);
        if (!cancelled) onFallback();
      }
    }

    setup();

    return () => {
      cancelled = true;
      destroyHlsPlayer(hlsRef.current);
      hlsRef.current = null;
      const el = videoRef.current;
      if (el) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
    };
  }, [channel, preferNative, onFallback]);

  return (
    <div className={`absolute inset-0 flex items-center justify-center ${className ?? ''}`}>
      <video
        ref={videoRef}
        className="w-full h-full"
        playsInline
        autoPlay
        controls
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}
      {qualities.length > 0 && (
        <QualitySelector
          levels={qualities}
          currentIndex={currentQuality}
          onSelect={handleQualityChange}
        />
      )}
    </div>
  );
}
