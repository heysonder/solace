"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { usePreferNativeHLS } from '@/hooks/usePlatform';
import { initHlsPlayer, destroyHlsPlayer, attachLivePauseHandling, getQualityLevels, setQualityLevel, type QualityLevel } from '@/lib/video/hlsPlayer';
import { fetchPlaybackToken, fetchRewindSource, fetchVodPlaybackUrl, type RewindSource } from '@/lib/video/twitchPlayback';
import { proxyUrl } from '@/lib/video/hlsPlaylist';
import VideoControls from './VideoControls';

interface NativeHlsPlayerProps {
  channel: string;
  onFallback: () => void;
  className?: string;
}

// 'live' plays Twitch's live playlist directly. 'rewind' plays the broadcast's
// in-progress VOD (through /api/proxy, Twitch sends no CORS headers for VODs)
// starting `start` seconds into the broadcast.
type PlaybackMode = { type: 'live' } | { type: 'rewind'; start: number };

const LIVE_MODE: PlaybackMode = { type: 'live' };
// The VOD trails the live edge by roughly 5-15s; seeks closer than this just go live.
const LIVE_EDGE_MARGIN_SECONDS = 20;
// Approximate delay between the broadcast and what the live player is showing.
const LIVE_PLAYBACK_DELAY_SECONDS = 10;
// Pauses shorter than this rejoin live; longer ones resume where you left off.
const RESUME_IN_PLACE_AFTER_MS = 10_000;

export default function NativeHlsPlayer({ channel, onFallback, className }: NativeHlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [loading, setLoading] = useState(true);
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [streamTitle, setStreamTitle] = useState('');
  const [gameName, setGameName] = useState('');
  const [artworkUrl, setArtworkUrl] = useState('');
  const [rewindSource, setRewindSource] = useState<RewindSource | null>(null);
  const [mode, setMode] = useState<PlaybackMode>(LIVE_MODE);
  const rewindSourceRef = useRef<RewindSource | null>(null);
  rewindSourceRef.current = rewindSource;
  const modeRef = useRef<PlaybackMode>(mode);
  modeRef.current = mode;
  const preferNative = usePreferNativeHLS();

  // Rewind needs hls.js (to load the VOD through the proxy) and a channel that
  // archives its broadcasts. Without either the player is simply live-only.
  useEffect(() => {
    let cancelled = false;
    setRewindSource(null);
    setMode(LIVE_MODE);
    if (!Hls.isSupported()) return;

    fetchRewindSource(channel)
      .then(source => { if (!cancelled) setRewindSource(source); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [channel]);

  const goLive = useCallback(() => {
    setMode(current => (current.type === 'live' ? current : LIVE_MODE));
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const source = rewindSourceRef.current;
    if (!source) return;

    const elapsed = (Date.now() - source.startedAt) / 1000;
    if (seconds >= elapsed - LIVE_EDGE_MARGIN_SECONDS) {
      goLive();
      return;
    }

    const target = Math.max(0, seconds);
    // Already on the VOD: an ordinary seek, no need to reload the source.
    if (modeRef.current.type === 'rewind' && hlsRef.current && videoRef.current) {
      videoRef.current.currentTime = target;
      return;
    }
    setMode({ type: 'rewind', start: target });
  }, [goLive]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/channel/${encodeURIComponent(channel)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled && data?.liveStream) {
          if (data.liveStream.title) setStreamTitle(data.liveStream.title);
          if (data.liveStream.game_name) setGameName(data.liveStream.game_name);
        }
        if (!cancelled && data?.user?.profile_image_url) {
          setArtworkUrl(data.user.profile_image_url);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [channel]);

  const handleQualityChange = useCallback((index: number) => {
    if (hlsRef.current) {
      setQualityLevel(hlsRef.current, index);
      setCurrentQuality(index);
    }
  }, []);

  // OS "Now Playing" (macOS Control Center, media keys, lock screen).
  // Without explicit metadata the browser shows a guessed entry and drops it
  // when the MSE source changes state, so own it and re-assert on every
  // playback transition.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') {
      return;
    }
    const session = navigator.mediaSession;

    const apply = () => {
      session.metadata = new MediaMetadata({
        title: streamTitle || `${channel} — live`,
        artist: channel,
        album: gameName || 'Live on Twitch',
        artwork: artworkUrl ? [{ src: artworkUrl, sizes: '300x300' }] : [],
      });
      session.playbackState = el.paused ? 'paused' : 'playing';
      applyPosition();
    };

    // With a VOD behind the stream the broadcast is a real timeline: report
    // its running length and where playback sits in it. Without one, clear
    // the position so the widget presents a plain live stream.
    const applyPosition = () => {
      if (typeof session.setPositionState !== 'function') return;
      try {
        if (!rewindSource) {
          session.setPositionState();
          return;
        }
        const duration = Math.max(1, (Date.now() - rewindSource.startedAt) / 1000);
        const position = mode.type === 'live'
          ? duration
          : Math.min(Math.max(0, el.currentTime), duration);
        // The rate must be non-zero or the call throws and nothing is shown;
        // paused state is conveyed by playbackState instead.
        session.setPositionState({
          duration,
          position,
          playbackRate: el.playbackRate || 1,
        });
      } catch (err) {
        console.warn('[NativeHlsPlayer] Could not update Now Playing position:', err);
      }
    };

    const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Action not supported by this browser
      }
    };

    apply();
    setHandler('play', () => { el.play().catch(() => {}); });
    setHandler('pause', () => { el.pause(); });
    // Scrubbing from the OS widget only makes sense when there is a VOD to
    // seek into; a plain live stream exposes play/pause alone.
    const currentPosition = () => (mode.type === 'live' && rewindSource
      ? (Date.now() - rewindSource.startedAt) / 1000
      : el.currentTime);
    setHandler('seekto', rewindSource ? details => {
      if (typeof details.seekTime === 'number') seekTo(details.seekTime);
    } : null);
    setHandler('seekbackward', rewindSource ? details => {
      seekTo(currentPosition() - (details.seekOffset || 10));
    } : null);
    setHandler('seekforward', rewindSource ? details => {
      seekTo(currentPosition() + (details.seekOffset || 10));
    } : null);
    setHandler('previoustrack', null);
    setHandler('nexttrack', null);

    const events = ['play', 'playing', 'pause', 'loadedmetadata', 'durationchange', 'seeked'] as const;
    events.forEach(name => el.addEventListener(name, apply));
    // The broadcast keeps growing, so refresh its length periodically.
    const positionTimer = setInterval(applyPosition, 5000);

    return () => {
      clearInterval(positionTimer);
      events.forEach(name => el.removeEventListener(name, apply));
      setHandler('play', null);
      setHandler('pause', null);
      setHandler('seekto', null);
      setHandler('seekbackward', null);
      setHandler('seekforward', null);
      session.metadata = null;
      session.playbackState = 'none';
    };
  }, [channel, streamTitle, gameName, artworkUrl, rewindSource, mode, seekTo]);

  useEffect(() => {
    // Wait for platform detection before choosing playback engine
    if (preferNative === null || !videoRef.current) return;

    let cancelled = false;
    let activeVideo: HTMLVideoElement | null = null;
    let detachPauseHandling: (() => void) | null = null;

    async function setup() {
      const el = videoRef.current;
      if (!el) return;
      activeVideo = el;

      try {
        const source = rewindSourceRef.current;
        if (mode.type === 'rewind' && source && Hls.isSupported()) {
          setLoading(true);
          const vodUrl = await fetchVodPlaybackUrl(source.vodId);
          if (cancelled) return;

          // A broken rewind session drops back to live, not to the iframe.
          const hls = initHlsPlayer(el, proxyUrl(vodUrl), () => {
            if (!cancelled) setMode(LIVE_MODE);
          }, { rewindPosition: mode.start });
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
          return;
        }

        // Fetch playback token directly from Twitch GQL (client-side)
        // Server-side API route gets blocked by Twitch on cloud provider IPs
        const { m3u8Url } = await fetchPlaybackToken(channel);
        if (cancelled) return;

        if (Hls.isSupported()) {
          // hls.js keeps HLS requests browser-side, which avoids routing live
          // media through Vercel serverless while still letting our loader
          // strip playlist ad markers.
          const hls = initHlsPlayer(el, m3u8Url, () => {
            if (!cancelled) onFallback();
          });
          hlsRef.current = hls;
          detachPauseHandling = attachLivePauseHandling(hls, el, pausedMs => {
            // With a VOD to fall back on, a real pause resumes where it left
            // off instead of skipping ahead to live.
            const rewind = rewindSourceRef.current;
            if (!rewind || pausedMs < RESUME_IN_PLACE_AFTER_MS) return false;
            const pausedAtSeconds = (Date.now() - pausedMs - rewind.startedAt) / 1000;
            setMode({ type: 'rewind', start: Math.max(0, pausedAtSeconds - LIVE_PLAYBACK_DELAY_SECONDS) });
            return true;
          });

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelled) return;
            setLoading(false);
            setQualities(getQualityLevels(hls));
            el.play().catch(() => {});
          });

          hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
            if (!cancelled) setCurrentQuality(data.level);
          });
        } else if (preferNative && el.canPlayType('application/vnd.apple.mpegurl')) {
          // Native HLS cannot intercept playlists, so it still uses the local
          // proxy as a best-effort fallback on platforms without hls.js.
          el.src = proxyUrl(m3u8Url);
          el.addEventListener('loadeddata', () => {
            if (!cancelled) setLoading(false);
          }, { once: true });
          el.addEventListener('error', () => {
            if (!cancelled) onFallback();
          }, { once: true });
          el.play().catch(() => {});
        } else {
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
      detachPauseHandling?.();
      destroyHlsPlayer(hlsRef.current);
      hlsRef.current = null;
      const el = activeVideo;
      if (el) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
    };
  }, [channel, preferNative, onFallback, mode]);

  return (
    <div className={className} data-player-root style={{ position: 'absolute', inset: 0 }}>
      <video
        ref={videoRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          backgroundColor: 'black',
        }}
        playsInline
        autoPlay
      />
      <VideoControls
        videoRef={videoRef}
        streamTitle={streamTitle}
        gameName={gameName}
        qualityLevels={qualities}
        currentQuality={currentQuality}
        onQualityChange={handleQualityChange}
        rewind={rewindSource ? {
          startedAt: rewindSource.startedAt,
          isLive: mode.type === 'live',
          onSeek: seekTo,
          onGoLive: goLive,
        } : undefined}
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
