/**
 * HLS ad-segment filter for Twitch streams.
 *
 * Twitch injects mid-roll and pre-roll ads into the HLS playlist using
 * EXT-X-DATERANGE tags with CLASS="twitch-stitched-ad" (or similar).
 * The ad content lives inside DISCONTINUITY blocks in the media playlist.
 *
 * This module provides:
 * 1. A function to strip ad segments from raw M3U8 playlist text
 * 2. A custom hls.js loader that proxies requests and filters ad segments
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
 * Wrap a URL through the /api/proxy endpoint to bypass CORS.
 */
function proxyUrl(url: string): string {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

/**
 * Rewrite absolute URLs inside an M3U8 playlist to go through the proxy.
 * This ensures variant playlists and segment URLs are also proxied.
 */
function rewritePlaylistUrls(playlistText: string): string {
  return playlistText.replace(/^(https?:\/\/.+)$/gm, (match) => {
    return proxyUrl(match);
  });
}

/**
 * Custom hls.js loader that:
 * 1. Routes all requests through /api/proxy to bypass CORS
 * 2. Rewrites URLs inside M3U8 playlists so sub-requests also go through the proxy
 * 3. Strips ad segments from media playlists
 */
export function createAdFilterLoader(): typeof Hls.DefaultConfig.loader {
  const DefaultLoader = Hls.DefaultConfig.loader;

  class AdFilterProxyLoader extends (DefaultLoader as any) {
    load(context: any, config: any, callbacks: any): void {
      // Route through proxy if URL points to Twitch CDN (CORS-blocked)
      // Only proxy actual external URLs, not already-proxied ones
      const url: string = context.url;
      if (url.startsWith('https://')) {
        console.log('[AdFilter] Proxying:', url.substring(0, 80) + '...');
        context.url = proxyUrl(url);
      }

      const originalOnSuccess = callbacks.onSuccess;

      callbacks.onSuccess = (response: any, stats: any, ctx: any, networkDetails: any) => {
        if (typeof response.data === 'string') {
          // Rewrite URLs in playlists so sub-requests go through proxy
          if (response.data.includes('#EXTM3U')) {
            response.data = rewritePlaylistUrls(response.data);
          }

          // Strip ad segments from media playlists
          if (response.data.includes('#EXTINF:') && hasAdSegments(response.data)) {
            console.log('[AdFilter] Stripping ad segments from playlist');
            response.data = stripAdSegments(response.data);
          }
        }
        originalOnSuccess(response, stats, ctx, networkDetails);
      };

      super.load(context, config, callbacks);
    }
  }

  return AdFilterProxyLoader as unknown as typeof Hls.DefaultConfig.loader;
}
