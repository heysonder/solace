const TWITCH_GQL_URL = 'https://gql.twitch.tv/gql';
const TWITCH_PUBLIC_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const PLAYBACK_TOKEN_SHA256 = '0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712';

export interface PlaybackData {
  m3u8Url: string;
  token: string;
  signature: string;
}

/**
 * Fetch a playback access token directly from Twitch GQL (client-side).
 * This runs in the browser so Twitch doesn't block it like it does
 * for requests from cloud provider IPs (Vercel/AWS).
 */
export async function fetchPlaybackToken(channel: string): Promise<PlaybackData> {
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
      login: channel.toLowerCase(),
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
