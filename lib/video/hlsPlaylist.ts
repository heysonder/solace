/**
 * Pure M3U8 playlist utilities — no browser dependencies.
 * Safe to import from server-side routes.
 *
 * Twitch injects mid-roll and pre-roll ads into the HLS playlist using
 * EXT-X-DATERANGE tags with CLASS="twitch-stitched-ad" (or similar).
 * The ad content lives inside DISCONTINUITY blocks in the media playlist.
 */

const AD_DATERANGE_PATTERN = /^#EXT-X-DATERANGE:.*(?:CLASS="twitch-stitched-ad"|ID="stitched-ad|CLASS="twitch-ad"|stitched-ad|X-TV-TWITCH-AD-|MIDROLL|midroll)/i;
const AD_SCTE35_OUT_PATTERN = /^#EXT-X-SCTE35-OUT/i;
const AD_SCTE35_IN_PATTERN = /^#EXT-X-SCTE35-IN/i;
const AD_CUE_OUT_PATTERN = /^#EXT-X-CUE-OUT/i;
const AD_CUE_OUT_CONT_PATTERN = /^#EXT-X-CUE-OUT-CONT/i;
const AD_CUE_IN_PATTERN = /^#EXT-X-CUE-IN/i;
const DISCONTINUITY_PATTERN = /^#EXT-X-DISCONTINUITY$/;
const PREFETCH_PATTERN = /^#EXT-X-TWITCH-PREFETCH:/;
const EXTINF_PATTERN = /^#EXTINF:([0-9.]+)/;
const DATERANGE_DURATION_PATTERN = /DURATION=([0-9.]+)/;
const LIVE_EXTINF_PATTERN = /^#EXTINF:[0-9.]+,live\b/i;
const AD_TRACKING_URL_PATTERNS = [
  /(X-TV-TWITCH-AD-URL=")(?:[^"]*)(")/g,
  /(X-TV-TWITCH-AD-CLICK-TRACKING-URL=")(?:[^"]*)(")/g,
] as const;

function sanitizeAdMetadata(line: string): string {
  let sanitized = line;
  for (const pattern of AD_TRACKING_URL_PATTERNS) {
    sanitized = sanitized.replace(pattern, '$1https://twitch.tv$2');
  }
  return sanitized;
}

function stripResidualAdSegments(lines: string[]): string[] {
  const output: string[] = [];
  let pendingExtinf: string | null = null;

  for (const rawLine of lines) {
    const line = sanitizeAdMetadata(rawLine);

    if (PREFETCH_PATTERN.test(line)) {
      continue;
    }

    if (AD_DATERANGE_PATTERN.test(line)) {
      continue;
    }

    if (
      AD_SCTE35_OUT_PATTERN.test(line) ||
      AD_SCTE35_IN_PATTERN.test(line) ||
      AD_CUE_OUT_PATTERN.test(line) ||
      AD_CUE_OUT_CONT_PATTERN.test(line) ||
      AD_CUE_IN_PATTERN.test(line)
    ) {
      continue;
    }

    if (EXTINF_PATTERN.test(line)) {
      pendingExtinf = line;
      continue;
    }

    if (!line.startsWith('#') && line.trim().length > 0) {
      if (pendingExtinf) {
        if (LIVE_EXTINF_PATTERN.test(pendingExtinf)) {
          output.push(pendingExtinf);
          output.push(line);
        }
        pendingExtinf = null;
      } else {
        output.push(line);
      }
      continue;
    }

    if (pendingExtinf) {
      output.push(pendingExtinf);
      pendingExtinf = null;
    }

    output.push(line);
  }

  if (pendingExtinf) {
    output.push(pendingExtinf);
  }

  return output;
}

/**
 * Strip ad segments from a Twitch HLS media playlist.
 * Returns the cleaned playlist text.
 *
 * Strategy: when an ad-marker tag is seen (DATERANGE stitched-ad, SCTE35-OUT,
 * CUE-OUT, CUE-OUT-CONT), enter ad mode. Exit on any of:
 *   - explicit close tag (SCTE35-IN, CUE-IN)
 *   - accumulated EXTINF durations meeting/exceeding a DATERANGE DURATION=
 *   - a second DISCONTINUITY after entering ad mode (bounds the ad region)
 */
export function stripAdSegments(playlistText: string): string {
  const normalizedText = playlistText.replace(/\r/g, '');
  const lines = normalizedText.split('\n');
  const output: string[] = [];
  let sawAdMarkers = false;

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
    const line = sanitizeAdMetadata(lines[i]);

    if (AD_DATERANGE_PATTERN.test(line)) {
      sawAdMarkers = true;
      inAd = true;
      const match = line.match(DATERANGE_DURATION_PATTERN);
      adDurationTarget = match ? parseFloat(match[1]) : 0;
      adDurationElapsed = 0;
      discontinuitiesSeen = 0;
      continue;
    }

    if (
      AD_SCTE35_OUT_PATTERN.test(line) ||
      AD_CUE_OUT_PATTERN.test(line) ||
      AD_CUE_OUT_CONT_PATTERN.test(line)
    ) {
      sawAdMarkers = true;
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
          output.push(line);
        }
        continue;
      }

      const extinf = line.match(EXTINF_PATTERN);
      if (extinf) {
        if (LIVE_EXTINF_PATTERN.test(line) && !adDurationTarget) {
          exitAd();
          output.push(line);
          continue;
        }
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

  return (sawAdMarkers ? stripResidualAdSegments(output) : output).join('\n');
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
      AD_CUE_OUT_PATTERN.test(line) ||
      AD_CUE_OUT_CONT_PATTERN.test(line)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Wrap a URL through the proxy endpoint to bypass CORS.
 * Defaults to the app-local Next.js proxy route. Override with
 * NEXT_PUBLIC_TTV_PROXY_URL when an external proxy is explicitly desired.
 */
const PROXY_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_TTV_PROXY_URL?.trim()) ||
  '';

export function proxyUrl(url: string): string {
  if (!PROXY_BASE) return `/api/proxy?url=${encodeURIComponent(url)}`;
  return `${PROXY_BASE.replace(/\/+$/, '')}/?url=${encodeURIComponent(url)}`;
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
