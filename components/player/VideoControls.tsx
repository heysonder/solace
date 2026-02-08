"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';

interface VideoControlsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  channel?: string;
  streamTitle?: string;
}

export default function VideoControls({ videoRef, channel, streamTitle }: VideoControlsProps) {
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [visible, setVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimer.current);
    setVisible(true);
    hideTimer.current = setTimeout(() => setVisible(false), 3000);
  }, []);

  useEffect(() => {
    scheduleHide();
    return () => clearTimeout(hideTimer.current);
  }, [scheduleHide]);

  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  }, [videoRef]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, [videoRef]);

  const handleVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const val = parseFloat(e.target.value);
    v.volume = val;
    setVolume(val);
    if (val === 0) { v.muted = true; setMuted(true); }
    else if (v.muted) { v.muted = false; setMuted(false); }
  }, [videoRef]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current?.closest('[data-player-root]') as HTMLElement | null;
    if (!container) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else container.requestFullscreen();
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10"
      onMouseMove={scheduleHide}
      onClick={(e) => {
        // Only toggle play if clicking the backdrop, not controls
        if (e.target === e.currentTarget) togglePlay();
      }}
    >
      {/* Top title bar */}
      {(channel || streamTitle) && (
        <div
          className={`absolute top-0 left-0 right-0 px-4 py-3 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 ${
            visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {channel && (
            <p className="text-white font-semibold text-sm">{channel}</p>
          )}
          {streamTitle && (
            <p className="text-white/70 text-xs truncate mt-0.5">{streamTitle}</p>
          )}
        </div>
      )}

      {/* Bottom controls bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button onClick={togglePlay} className="text-white hover:text-white/80 transition-colors">
            {playing ? <Pause className="w-5 h-5" fill="white" /> : <Play className="w-5 h-5" fill="white" />}
          </button>

          {/* Volume */}
          <button onClick={toggleMute} className="text-white hover:text-white/80 transition-colors">
            {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={muted ? 0 : volume}
            onChange={handleVolume}
            className="w-20 h-1 accent-white cursor-pointer"
          />

          <div className="flex-1" />

          {/* LIVE badge */}
          <span className="px-2 py-0.5 text-xs font-bold bg-red-600 text-white rounded">LIVE</span>

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} className="text-white hover:text-white/80 transition-colors">
            {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
