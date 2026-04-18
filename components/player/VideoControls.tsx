"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, Volume1, VolumeX, Maximize, Minimize } from 'lucide-react';
import QualitySelector from './QualitySelector';
import type { QualityLevel } from '@/lib/video/hlsPlayer';

interface VideoControlsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  streamTitle?: string;
  gameName?: string;
  qualityLevels?: QualityLevel[];
  currentQuality?: number;
  onQualityChange?: (index: number) => void;
}

// Quadratic curve so the slider feels linear to human hearing.
// Slider position (0-1) maps to volume via pos^2; invert with sqrt.
function sliderToVolume(pos: number): number {
  return pos * pos;
}
function volumeToSlider(vol: number): number {
  return Math.sqrt(vol);
}

export default function VideoControls({
  videoRef,
  streamTitle,
  gameName,
  qualityLevels,
  currentQuality = -1,
  onQualityChange,
}: VideoControlsProps) {
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [visible, setVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const scheduleHide = useCallback((delay = 2500) => {
    clearTimeout(hideTimer.current);
    setVisible(true);
    hideTimer.current = setTimeout(() => setVisible(false), delay);
  }, []);

  const handleMouseLeave = useCallback(() => {
    // Shorter delay when cursor leaves the player entirely
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 600);
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
    const sliderPos = parseFloat(e.target.value);
    const actualVol = sliderToVolume(sliderPos);
    v.volume = actualVol;
    setVolume(actualVol);
    if (actualVol === 0) { v.muted = true; setMuted(true); }
    else if (v.muted) { v.muted = false; setMuted(false); }
  }, [videoRef]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current?.closest('[data-player-root]') as HTMLElement | null;
    if (!container) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else container.requestFullscreen();
  }, []);

  // Use faster fade-out, smoother fade-in
  const overlayTransition = visible
    ? 'opacity 200ms ease-out'
    : 'opacity 150ms ease-in';

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.35 ? Volume1 : Volume2;
  const sliderDisplay = muted ? 0 : volumeToSlider(volume);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10"
      onMouseMove={() => scheduleHide()}
      onMouseLeave={handleMouseLeave}
      onClick={(e) => {
        // Only toggle play if clicking the backdrop, not controls
        if (e.target === e.currentTarget) togglePlay();
      }}
    >
      {/* Top bar */}
      <div
        className={`absolute top-0 left-0 right-0 px-4 py-3 bg-gradient-to-b from-black/80 to-transparent flex items-start justify-between ${
          visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ transition: overlayTransition }}
      >
        <div className="min-w-0 flex-1">
          {streamTitle && (
            <p className="text-white font-semibold text-sm truncate">{streamTitle}</p>
          )}
          {gameName && (
            <p className="text-white/70 text-xs mt-0.5">{gameName}</p>
          )}
        </div>
        {/* Quality selector lives in the top-right, fades with the overlay */}
        {qualityLevels && qualityLevels.length > 0 && onQualityChange && (
          <div className="ml-3 flex-shrink-0">
            <QualitySelector
              levels={qualityLevels}
              currentIndex={currentQuality}
              onSelect={onQualityChange}
            />
          </div>
        )}
      </div>

      {/* Bottom controls bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-black/80 to-transparent ${
          visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ transition: overlayTransition }}
      >
        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button onClick={togglePlay} className="text-white hover:text-white/80 transition-colors">
            {playing ? <Pause className="w-5 h-5" fill="white" /> : <Play className="w-5 h-5" fill="white" />}
          </button>

          {/* Volume */}
          <div className="flex items-center gap-2 group/vol">
            <button onClick={toggleMute} className="text-white hover:text-white/80 transition-colors">
              <VolumeIcon className="w-5 h-5" />
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={sliderDisplay}
              onChange={handleVolume}
              className="player-volume-slider w-20 h-1 cursor-pointer"
            />
          </div>

          <div className="flex-1" />

          {/* LIVE badge */}
          <span className="px-2 py-0.5 text-xs font-bold bg-red-600 text-white rounded-md">LIVE</span>

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} className="text-white hover:text-white/80 transition-colors">
            {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
