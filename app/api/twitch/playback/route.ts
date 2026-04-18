import { NextRequest, NextResponse } from 'next/server';
import { ensureValidTwitchTokens, applyCookieDescriptors } from '@/lib/auth/twitchTokens';

const TWITCH_GQL_URL = 'https://gql.twitch.tv/gql';
const TWITCH_PUBLIC_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const PLAYBACK_TOKEN_SHA256 = '0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712';
const TWITCH_PLAYER_TYPE = 'site';

// In-memory cache with 30s TTL, keyed by "channel" or "channel:userId"
const cache = new Map<string, { data: PlaybackData; expiresAt: number }>();
const CACHE_TTL = 30_000;

interface PlaybackData {
  m3u8Url: string;
  token: string;
  signature: string;
}

function getCached(key: string): PlaybackData | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  if (entry) cache.delete(key);
  return null;
}

async function fetchPlaybackToken(channel: string, userAccessToken?: string): Promise<PlaybackData> {
  const body = JSON.stringify({
    operationName: 'PlaybackAccessToken',
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: PLAYBACK_TOKEN_SHA256,
      },
    },
    variables: {
      isLive: true,
      login: channel,
      isVod: false,
      vodID: '',
      playerType: TWITCH_PLAYER_TYPE,
    },
  });

  const headers: Record<string, string> = {
    'Client-ID': TWITCH_PUBLIC_CLIENT_ID,
    'Content-Type': 'application/json',
  };

  // If user is authenticated, pass their OAuth token so Twitch
  // recognizes subscriptions and provides ad-free playback
  if (userAccessToken) {
    headers['Authorization'] = `OAuth ${userAccessToken}`;
  }

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

  const params = new URLSearchParams({
    token,
    sig: signature,
    allow_source: 'true',
    allow_audio_only: 'true',
    allow_spectre: 'true',
    fast_bread: 'true',
    p: String(Math.floor(Math.random() * 999999)),
    player_backend: 'mediaplayer',
    playlist_include_framerate: 'true',
    reassignments_supported: 'true',
    supported_codecs: 'avc1',
    cdm: 'wv',
    player_version: '1.28.0',
  });

  const m3u8Url = `https://usher.ttvnw.net/api/channel/hls/${channel.toLowerCase()}.m3u8?${params.toString()}`;

  return { m3u8Url, token, signature };
}

export async function GET(request: NextRequest) {
  const channel = request.nextUrl.searchParams.get('channel');

  if (!channel || !/^[a-zA-Z0-9_]{1,25}$/.test(channel)) {
    return NextResponse.json({ error: 'Invalid channel name' }, { status: 400 });
  }

  const channelLower = channel.toLowerCase();

  // Try to get the user's auth token for subscriber ad-free playback
  // Wrapped in try-catch so auth failures don't break anonymous playback
  let userAccessToken: string | undefined;
  let userId: string | undefined;
  let authCookies: Parameters<typeof applyCookieDescriptors>[1];
  try {
    const { tokens, cookies } = await ensureValidTwitchTokens(request);
    userAccessToken = tokens?.access_token;
    userId = tokens?.user_id;
    authCookies = cookies;
  } catch {
    // Auth failed — continue with anonymous playback
  }

  // Cache key includes userId so authenticated and anonymous requests don't mix
  const cacheKey = userId ? `${channelLower}:${userId}` : channelLower;

  const cached = getCached(cacheKey);
  if (cached) {
    const response = NextResponse.json(cached);
    if (authCookies) applyCookieDescriptors(response, authCookies);
    return response;
  }

  try {
    let data: PlaybackData;

    if (userAccessToken) {
      try {
        // Try authenticated request first (ad-free for subscribers)
        data = await fetchPlaybackToken(channelLower, userAccessToken);
      } catch {
        // Auth token rejected — retry anonymously
        console.warn('[playback] Authenticated request failed, retrying anonymously');
        data = await fetchPlaybackToken(channelLower);
      }
    } else {
      data = await fetchPlaybackToken(channelLower);
    }

    cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL });
    const response = NextResponse.json(data);
    if (authCookies) applyCookieDescriptors(response, authCookies);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch playback token';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
