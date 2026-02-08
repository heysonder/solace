/**
 * HLS ad-segment filter for Twitch streams.
 *
 * Twitch injects mid-roll and pre-roll ads into the HLS playlist using
 * EXT-X-DATERANGE tags with CLASS="twitch-stitched-ad" (or similar).
 * The ad content lives inside DISCONTINUITY blocks in the media playlist.
 *
 * This module provides:
 * 1. A function to strip ad segments from raw M3U8 playlist text
 * 2. A custom hls.js playlist loader class that intercepts and filters responses
 */

import Hls from 'hls.js';

// Patterns that indicate ad content in Twitch HLS playlists
const AD_DATERANGE_PATTERN = /^#EXT-X-DATERANGE:.*(?:CLASS="twitch-stitched-ad"|ID="stitched-ad|CLASS="twitch-ad|stitched-ad)/i;
const AD_SCTE35_PATTERN = /^#EXT-X-SCTE35-OUT/i;
const SCTE35_IN_PATTERN = /^#EXT-X-SCTE35-IN/i;
const DISCONTINUITY_PATTERN = /^#EXT-X-DISCONTINUITY$/;
const PREFETCH_PATTERN = /^#EXT-X-TWITCH-PREFETCH:/;

/**
 * Strip ad segments from a Twitch HLS media playlist.
 * Returns the cleaned playlist text.
 */
export function stripAdSegments(playlistText: string): string {
  const lines = playlistText.split('\n');
  const output: string[] = [];
  let inAd = false;
  let skipUntilDiscontinuity = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect ad start via DATERANGE
    if (AD_DATERANGE_PATTERN.test(line)) {
      inAd = true;
      skipUntilDiscontinuity = true;
      continue;
    }

    // Detect ad start via SCTE35-OUT
    if (AD_SCTE35_PATTERN.test(line)) {
      inAd = true;
      skipUntilDiscontinuity = true;
      continue;
    }

    // Detect ad end via SCTE35-IN
    if (SCTE35_IN_PATTERN.test(line)) {
      inAd = false;
      skipUntilDiscontinuity = false;
      continue;
    }

    // When we hit a discontinuity while in an ad block, check if ads are over
    if (DISCONTINUITY_PATTERN.test(line)) {
      if (skipUntilDiscontinuity && !inAd) {
        // End of ad discontinuity block
        skipUntilDiscontinuity = false;
        continue;
      }
      if (inAd) {
        // Still in ad, skip this discontinuity marker
        continue;
      }
    }

    // Skip ad prefetch segments
    if (inAd && PREFETCH_PATTERN.test(line)) {
      continue;
    }

    // If we're inside an ad block, skip segment lines and their EXTINF tags
    if (inAd || skipUntilDiscontinuity) {
      // Skip EXTINF lines and their following segment URLs
      if (line.startsWith('#EXTINF:') || (!line.startsWith('#') && line.trim().length > 0)) {
        continue;
      }
      // Also skip other ad-related tags
      if (line.startsWith('#EXT-X-DATERANGE:') || line.startsWith('#EXT-X-CUE-')) {
        continue;
      }
      continue;
    }

    output.push(line);
  }

  return output.join('\n');
}

/**
 * Check if a playlist contains ad segments.
 */
export function hasAdSegments(playlistText: string): boolean {
  return AD_DATERANGE_PATTERN.test(playlistText) || AD_SCTE35_PATTERN.test(playlistText);
}

/**
 * Custom hls.js loader that intercepts playlist responses and strips ad segments.
 * Use this as the `pLoader` (playlist loader) in hls.js config.
 */
export function createAdFilterLoader(): typeof Hls.DefaultConfig.loader {
  const DefaultLoader = Hls.DefaultConfig.loader;

  class AdFilterLoader extends (DefaultLoader as any) {
      load(context: any, config: any, callbacks: any): void {
      const originalOnSuccess = callbacks.onSuccess;

      callbacks.onSuccess = (response: any, stats: any, ctx: any, networkDetails: any) => {
        // Only filter media playlists (not master playlists)
        if (typeof response.data === 'string' && response.data.includes('#EXTINF:')) {
          if (hasAdSegments(response.data)) {
            console.log('[AdFilter] Stripping ad segments from playlist');
            response.data = stripAdSegments(response.data);
          }
        }
        originalOnSuccess(response, stats, ctx, networkDetails);
      };

      super.load(context, config, callbacks);
    }
  }

  return AdFilterLoader as unknown as typeof Hls.DefaultConfig.loader;
}
