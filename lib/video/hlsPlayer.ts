import Hls, { type HlsConfig, type Level } from 'hls.js';

export interface QualityLevel {
  index: number;
  height: number;
  bitrate: number;
  label: string;
}

const HLS_CONFIG: Partial<HlsConfig> = {
  lowLatencyMode: true,
  backBufferLength: 30,
  maxBufferLength: 10,
  maxMaxBufferLength: 30,
  liveSyncDurationCount: 3,
  liveMaxLatencyDurationCount: 6,
  enableWorker: true,
  progressive: true,
};

export function initHlsPlayer(
  video: HTMLVideoElement,
  url: string,
  onFatal?: () => void,
): Hls {
  const hls = new Hls(HLS_CONFIG);

  let mediaErrorRecoveries = 0;
  const MAX_MEDIA_RECOVERIES = 3;

  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data.fatal) return;

    switch (data.type) {
      case Hls.ErrorTypes.NETWORK_ERROR:
        console.warn('[HLS] Network error, attempting recovery...');
        hls.startLoad();
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
