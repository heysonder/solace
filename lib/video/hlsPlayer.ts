import Hls, { type HlsConfig, type Level } from 'hls.js';
import { createAdFilterLoader } from './adFilter';

export interface QualityLevel {
  index: number;
  height: number;
  bitrate: number;
  label: string;
}

const HLS_CONFIG: Partial<HlsConfig> = {
  lowLatencyMode: false,
  backBufferLength: 30,
  maxBufferLength: 10,
  maxMaxBufferLength: 30,
  liveSyncDurationCount: 3,
  liveMaxLatencyDurationCount: 6,
  // Report an infinite duration for live so the OS Now Playing widget shows
  // "LIVE" rather than a scrubber and an ever-growing track length.
  liveDurationInfinity: true,
  enableWorker: true,
  progressive: true,
  loader: createAdFilterLoader(),
};

// A rewind session plays the broadcast's growing VOD playlist. hls.js sees it
// as live, so the "too far behind, snap to the edge" guard must be off or it
// would undo every seek, and it gets a deeper buffer since it is not chasing
// the live edge.
const REWIND_CONFIG: Partial<HlsConfig> = {
  liveMaxLatencyDurationCount: Infinity,
  // A rewound position is a real point on a timeline, so keep a duration.
  liveDurationInfinity: false,
  maxBufferLength: 30,
  maxMaxBufferLength: 60,
};

export interface InitHlsOptions {
  /** Start a rewind session at this many seconds into the broadcast. */
  rewindPosition?: number;
}

export function initHlsPlayer(
  video: HTMLVideoElement,
  url: string,
  onFatal?: () => void,
  options: InitHlsOptions = {},
): Hls {
  const hls = new Hls(
    options.rewindPosition === undefined
      ? HLS_CONFIG
      : { ...HLS_CONFIG, ...REWIND_CONFIG, startPosition: Math.max(0, options.rewindPosition) },
  );

  let mediaErrorRecoveries = 0;
  let networkErrorRecoveries = 0;
  const MAX_MEDIA_RECOVERIES = 3;
  const MAX_NETWORK_RECOVERIES = 3;

  // Recovery budgets are per incident, not per session: once media is flowing
  // again a later hiccup (hours in, or after a long pause) starts fresh instead
  // of tipping the player into the iframe fallback.
  hls.on(Hls.Events.FRAG_BUFFERED, () => {
    mediaErrorRecoveries = 0;
    networkErrorRecoveries = 0;
  });

  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data.fatal) return;

    switch (data.type) {
      case Hls.ErrorTypes.NETWORK_ERROR:
        if (networkErrorRecoveries < MAX_NETWORK_RECOVERIES) {
          networkErrorRecoveries++;
          console.warn(`[HLS] Network error, recovering (${networkErrorRecoveries}/${MAX_NETWORK_RECOVERIES})...`);
          hls.startLoad();
        } else {
          console.error('[HLS] Fatal network error after max recoveries');
          onFatal?.();
        }
        break;
      case Hls.ErrorTypes.MEDIA_ERROR:
        if (mediaErrorRecoveries < MAX_MEDIA_RECOVERIES) {
          mediaErrorRecoveries++;
          console.warn(`[HLS] Media error, recovering (${mediaErrorRecoveries}/${MAX_MEDIA_RECOVERIES})...`);
          hls.recoverMediaError();
        } else {
          console.error('[HLS] Fatal media error after max recoveries');
          onFatal?.();
        }
        break;
      default:
        console.error('[HLS] Fatal error:', data.type, data.details);
        onFatal?.();
        break;
    }
  });

  hls.loadSource(url);
  hls.attachMedia(video);

  return hls;
}

/**
 * The live playlist has no rewind buffer, so pausing must not leave hls.js polling
 * a playlist whose window slides past the paused position (that ends in fatal
 * errors and an iframe fallback). Stop loading while paused and rejoin at the
 * live edge on resume. Returns a cleanup function.
 */
export function attachLivePauseHandling(
  hls: Hls,
  video: HTMLVideoElement,
  /**
   * Called on resume with how long playback was paused. Return true to take
   * over (e.g. switch to a rewind session) instead of rejoining the live edge.
   */
  onResume?: (pausedMs: number) => boolean,
): () => void {
  let stoppedForPause = false;
  let pausedAt = 0;

  const seekToLive = () => {
    const live = hls.liveSyncPosition;
    if (typeof live === 'number' && Number.isFinite(live) && Math.abs(video.currentTime - live) > 1) {
      video.currentTime = live;
    }
  };

  const onPause = () => {
    if (video.ended || video.seeking) return;
    stoppedForPause = true;
    pausedAt = Date.now();
    hls.stopLoad();
  };

  const onPlay = () => {
    if (!stoppedForPause) return;
    stoppedForPause = false;
    if (onResume?.(Date.now() - pausedAt)) return;
    // The playlist we hold is as old as the pause; refresh it, then jump.
    hls.once(Hls.Events.LEVEL_UPDATED, seekToLive);
    hls.startLoad(-1);
  };

  video.addEventListener('pause', onPause);
  video.addEventListener('play', onPlay);

  return () => {
    video.removeEventListener('pause', onPause);
    video.removeEventListener('play', onPlay);
    hls.off(Hls.Events.LEVEL_UPDATED, seekToLive);
  };
}

export function destroyHlsPlayer(hls: Hls | null): void {
  if (!hls) return;
  hls.destroy();
}

export function getQualityLevels(hls: Hls): QualityLevel[] {
  return hls.levels.map((level: Level, index: number) => {
    const fps = level.attrs?.['FRAME-RATE'] ? parseInt(level.attrs['FRAME-RATE']) : 0;
    const height = level.height;
    const label = fps > 30 ? `${height}p${fps}` : `${height}p`;
    return {
      index,
      height,
      bitrate: level.bitrate,
      label,
    };
  }).sort((a, b) => b.height - a.height);
}

export function setQualityLevel(hls: Hls, index: number): void {
  // -1 = auto
  hls.currentLevel = index;
}

export function getCurrentQualityLevel(hls: Hls): number {
  return hls.currentLevel;
}
