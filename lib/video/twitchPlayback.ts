const TWITCH_GQL_URL = 'https://gql.twitch.tv/gql';
const TWITCH_PUBLIC_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const TWITCH_USHER_BASE = 'https://usher.ttvnw.net';
const TWITCH_PLAYER_TYPE = 'site';
const TWITCH_PLATFORM = 'web';
const DEVICE_ID_STORAGE_KEY = 'twitch-device-id';
const DEFAULT_APP_VERSION = 'solace-web';
const PLAYBACK_ACCESS_TOKEN_QUERY = `
  query PlaybackAccessToken_Template(
    $login: String!
    $isLive: Boolean!
    $vodID: ID!
    $isVod: Boolean!
    $playerType: String!
    $platform: String!
  ) {
    streamPlaybackAccessToken(
      channelName: $login
      params: { platform: $platform, playerBackend: "mediaplayer", playerType: $playerType }
    ) @include(if: $isLive) {
      value
      signature
      authorization {
        isForbidden
        forbiddenReasonCode
      }
      __typename
    }
    videoPlaybackAccessToken(
      id: $vodID
      params: { platform: $platform, playerBackend: "mediaplayer", playerType: $playerType }
    ) @include(if: $isVod) {
      value
      signature
      __typename
    }
  }
`.trim();

export interface PlaybackData {
  m3u8Url: string;
  token: string;
  signature: string;
}

interface BuildPlaybackUrlOptions {
  channel: string;
  token: string;
  signature: string;
  playSessionId: string;
  language: string;
  appVersion?: string;
}

function encodeBase64(value: string): string {
  if (typeof btoa === 'function') {
    return btoa(value);
  }

  return Buffer.from(value, 'utf8').toString('base64');
}

function createRandomHex(length: number): string {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
  }

  let output = '';
  while (output.length < length) {
    output += Math.floor(Math.random() * 16).toString(16);
  }
  return output;
}

function createPlaySessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  const part1 = createRandomHex(8);
  const part2 = createRandomHex(4);
  const part3 = `4${createRandomHex(3)}`;
  const part4 = `${(8 + Math.floor(Math.random() * 4)).toString(16)}${createRandomHex(3)}`;
  const part5 = createRandomHex(12);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

function getOrCreateDeviceId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) {
      return existing;
    }

    const next = createRandomHex(32);
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, next);
    return next;
  } catch {
    return null;
  }
}

export function buildPlaybackUrl({
  channel,
  token,
  signature,
  playSessionId,
  language,
  appVersion = DEFAULT_APP_VERSION,
}: BuildPlaybackUrlOptions): string {
  const acmb = encodeBase64(JSON.stringify({
    BrowseItemTrackingId: null,
    AppVersion: appVersion,
    ClientApp: 'web',
    LimitAdTracking: false,
  }));

  const params = new URLSearchParams({
    sig: signature,
    token,
    play_session_id: playSessionId,
    lang: language,
    acmb,
    allow_source: 'true',
    fast_bread: 'true',
    playlist_include_framerate: 'true',
    reassignments_supported: 'true',
    player_backend: 'mediaplayer',
    p: String(Math.floor(Math.random() * 9_999_999)),
    include_unavailable: 'true',
    transcode_mode: 'cbr_v1',
  });

  return `${TWITCH_USHER_BASE}/api/channel/hls/${channel.toLowerCase()}.m3u8?${params.toString()}`;
}

export function isUsherChannelMasterUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'usher.ttvnw.net'
      && /^\/api(?:\/v2)?\/channel\/hls\/[^/]+\.m3u8$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Fetch a playback access token directly from Twitch GQL (client-side).
 * This runs in the browser so Twitch doesn't block it like it does
 * for requests from cloud provider IPs (Vercel/AWS).
 *
 * Note: User OAuth tokens can't be used here — they're issued under
 * our app's Client-ID, not Twitch's public web Client-ID, so Twitch
 * returns 401. Ad-free subscriber playback is handled by the iframe fallback.
 *
 * Use the same player type Twitch's main site uses. The previous
 * `thunderdome` player type only exposed low-quality renditions
 * (480p/360p/160p) for anonymous playback in Chrome/Firefox.
 */
export async function fetchPlaybackToken(channel: string): Promise<PlaybackData> {
  const normalizedChannel = channel.toLowerCase();
  const deviceId = getOrCreateDeviceId();
  const language = (typeof navigator !== 'undefined' && navigator.language)
    ? navigator.language.split('-')[0] || 'en'
    : 'en';
  const acceptLanguage = (typeof navigator !== 'undefined' && navigator.language)
    ? navigator.language
    : 'en-US';
  const playSessionId = createPlaySessionId();

  const headers: Record<string, string> = {
    'Client-ID': TWITCH_PUBLIC_CLIENT_ID,
    'Content-Type': 'text/plain; charset=UTF-8',
    'Accept': '*/*',
    'Accept-Language': acceptLanguage,
  };

  if (deviceId) {
    headers['Device-ID'] = deviceId;
  }

  const body = JSON.stringify({
    operationName: 'PlaybackAccessToken_Template',
    query: PLAYBACK_ACCESS_TOKEN_QUERY,
    variables: {
      isLive: true,
      login: normalizedChannel,
      isVod: false,
      vodID: '',
      playerType: TWITCH_PLAYER_TYPE,
      platform: TWITCH_PLATFORM,
    },
  });

  const res = await fetch(TWITCH_GQL_URL, {
    method: 'POST',
    headers,
    body,
  });

  if (!res.ok) {
    throw new Error(`GQL request failed: ${res.status}`);
  }

  const json = await res.json();
  const accessToken = json?.data?.streamPlaybackAccessToken;

  if (!accessToken?.value || !accessToken?.signature) {
    throw new Error('Channel is offline or token unavailable');
  }

  const token = accessToken.value;
  const signature = accessToken.signature;
  const m3u8Url = buildPlaybackUrl({
    channel: normalizedChannel,
    token,
    signature,
    playSessionId,
    language,
  });

  return { m3u8Url, token, signature };
}
