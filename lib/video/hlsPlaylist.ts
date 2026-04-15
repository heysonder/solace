/**
 * Pure M3U8 playlist utilities — no browser dependencies.
 * Safe to import from server-side routes.
 *
 * Twitch injects mid-roll and pre-roll ads into the HLS playlist using
 * EXT-X-DATERANGE tags with CLASS="twitch-stitched-ad" (or similar).
 * The ad content lives inside DISCONTINUITY blocks in the media playlist.
 */

const AD_DATERANGE_PATTERN = /^#EXT-X-DATERANGE:.*(?:CLASS="twitch-stitched-ad"|ID="stitched-ad|CLASS="twitch-ad|stitched-ad)/i;
const AD_SCTE35_OUT_PATTERN = /^#EXT-X-SCTE35-OUT/i;
const AD_SCTE35_IN_PATTERN = /^#EXT-X-SCTE35-IN/i;
const AD_CUE_OUT_PATTERN = /^#EXT-X-CUE-OUT/i;
const AD_CUE_IN_PATTERN = /^#EXT-X-CUE-IN/i;
const DISCONTINUITY_PATTERN = /^#EXT-X-DISCONTINUITY$/;
const PREFETCH_PATTERN = /^#EXT-X-TWITCH-PREFETCH:/;
const EXTINF_PATTERN = /^#EXTINF:([0-9.]+)/;
const DATERANGE_DURATION_PATTERN = /DURATION=([0-9.]+)/;

/**
 * Strip ad segments from a Twitch HLS media playlist.
 * Returns the cleaned playlist text.
 *
 * Strategy: when an ad-marker tag is seen (DATERANGE stitched-ad, SCTE35-OUT,
 * CUE-OUT), enter ad mode. Exit on any of:
 *   - explicit close tag (SCTE35-IN, CUE-IN)
 *   - accumulated EXTINF durations meeting/exceeding a DATERANGE DURATION=
 *   - a second DISCONTINUITY after entering ad mode (bounds the ad region)
 */
export function stripAdSegments(playlistText: string): string {
  const lines = playlistText.split('\n');
  const output: string[] = [];

  let inAd = false;
  let adDurationTarget = 0;
  let adDurationElapsed = 0;
  let discontinuitiesSeen = 0;

  const exitAd = () => {
    inAd = false;
    adDurationTarget = 0;
    adDurationElapsed = 0;
    discontinuitiesSeen = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (AD_DATERANGE_PATTERN.test(line)) {
      inAd = true;
      const match = line.match(DATERANGE_DURATION_PATTERN);
      adDurationTarget = match ? parseFloat(match[1]) : 0;
      adDurationElapsed = 0;
      discontinuitiesSeen = 0;
      continue;
    }

    if (AD_SCTE35_OUT_PATTERN.test(line) || AD_CUE_OUT_PATTERN.test(line)) {
      inAd = true;
      adDurationTarget = 0;
      adDurationElapsed = 0;
      discontinuitiesSeen = 0;
      continue;
    }

    if (AD_SCTE35_IN_PATTERN.test(line) || AD_CUE_IN_PATTERN.test(line)) {
      exitAd();
      continue;
    }

    if (inAd) {
      if (PREFETCH_PATTERN.test(line)) continue;
      if (line.startsWith('#EXT-X-DATERANGE:') || line.startsWith('#EXT-X-CUE-')) continue;

      if (DISCONTINUITY_PATTERN.test(line)) {
        discontinuitiesSeen++;
        if (!adDurationTarget && discontinuitiesSeen >= 2) {
          exitAd();
        }
        continue;
      }

      const extinf = line.match(EXTINF_PATTERN);
      if (extinf) {
        adDurationElapsed += parseFloat(extinf[1]);
        continue;
      }

      // Segment URL line: drop
      if (!line.startsWith('#') && line.trim().length > 0) {
        if (adDurationTarget && adDurationElapsed >= adDurationTarget) {
          exitAd();
        }
        continue;
      }

      // Any other tag while in ad: drop
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
  // Line-anchored patterns are single-line; scan each line of the playlist.
  const lines = playlistText.split('\n');
  for (const line of lines) {
    if (
      AD_DATERANGE_PATTERN.test(line) ||
      AD_SCTE35_OUT_PATTERN.test(line) ||
      AD_CUE_OUT_PATTERN.test(line)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Wrap a URL through the /api/proxy endpoint to bypass CORS.
 */
export function proxyUrl(url: string): string {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

/**
 * Rewrite URLs inside an M3U8 playlist so sub-requests go through the proxy.
 *
 * Twitch variant/segment URIs can be absolute (https://...) or relative
 * (e.g. `1.ts`). Relative URIs would resolve against /api/proxy in the
 * browser (broken), so we resolve them against `baseUrl` — the URL of the
 * manifest itself — before wrapping. If baseUrl is omitted, only absolute
 * URLs are rewritten (legacy behavior; relative lines are left untouched).
 */
export function rewritePlaylistUrls(
  playlistText: string,
  baseUrl?: string,
  wrap: (url: string) => string = proxyUrl,
): string {
  const lines = playlistText.split('\n');
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Tags and blanks pass through
    if (!trimmed || trimmed.startsWith('#')) {
      out.push(line);
      continue;
    }

    // Absolute URL — always wrap
    if (/^https?:\/\//i.test(trimmed)) {
      out.push(wrap(trimmed));
      continue;
    }

    // Relative URI — resolve against baseUrl if provided
    if (baseUrl) {
      try {
        const resolved = new URL(trimmed, baseUrl).toString();
        out.push(wrap(resolved));
        continue;
      } catch {
        // Fall through and leave the line untouched
      }
    }

    out.push(line);
  }

  return out.join('\n');
}
