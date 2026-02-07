import { NextRequest, NextResponse } from 'next/server';

const TWITCH_GQL_URL = 'https://gql.twitch.tv/gql';
const TWITCH_PUBLIC_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const PLAYBACK_TOKEN_SHA256 = '0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712';

// In-memory cache with 30s TTL
const cache = new Map<string, { data: PlaybackData; expiresAt: number }>();
const CACHE_TTL = 30_000;

interface PlaybackData {
  m3u8Url: string;
  token: string;
  signature: string;
}

function getCached(channel: string): PlaybackData | null {
  const entry = cache.get(channel);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  if (entry) cache.delete(channel);
  return null;
}

async function fetchPlaybackToken(channel: string): Promise<PlaybackData> {
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
      playerType: 'site',
    },
  });

  const res = await fetch(TWITCH_GQL_URL, {
    method: 'POST',
    headers: {
      'Client-ID': TWITCH_PUBLIC_CLIENT_ID,
      'Content-Type': 'application/json',
    },
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

  const cached = getCached(channel.toLowerCase());
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const data = await fetchPlaybackToken(channel.toLowerCase());
    cache.set(channel.toLowerCase(), { data, expiresAt: Date.now() + CACHE_TTL });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch playback token';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
