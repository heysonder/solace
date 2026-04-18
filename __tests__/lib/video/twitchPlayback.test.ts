import { describe, expect, it } from 'vitest';
import { buildPlaybackUrl, isUsherChannelMasterUrl } from '@/lib/video/twitchPlayback';

describe('twitchPlayback helpers', () => {
  describe('buildPlaybackUrl', () => {
    it('builds a Twitch-compatible usher URL with current playback params', () => {
      const url = new URL(buildPlaybackUrl({
        channel: 'riotgames',
        token: 'token-value',
        signature: 'signature-value',
        playSessionId: 'play-session-id',
        language: 'en',
        appVersion: 'solace-dev',
      }));

      expect(url.origin).toBe('https://usher.ttvnw.net');
      expect(url.pathname).toBe('/api/channel/hls/riotgames.m3u8');
      expect(url.searchParams.get('token')).toBe('token-value');
      expect(url.searchParams.get('sig')).toBe('signature-value');
      expect(url.searchParams.get('play_session_id')).toBe('play-session-id');
      expect(url.searchParams.get('lang')).toBe('en');
      expect(url.searchParams.get('allow_source')).toBe('true');
      expect(url.searchParams.get('fast_bread')).toBe('true');
      expect(url.searchParams.get('playlist_include_framerate')).toBe('true');
      expect(url.searchParams.get('reassignments_supported')).toBe('true');
      expect(url.searchParams.get('player_backend')).toBe('mediaplayer');
      expect(url.searchParams.get('include_unavailable')).toBe('true');
      expect(url.searchParams.get('transcode_mode')).toBe('cbr_v1');

      const acmb = url.searchParams.get('acmb');
      expect(acmb).toBeTruthy();
      expect(Buffer.from(acmb!, 'base64').toString('utf8')).toContain('"ClientApp":"web"');

      expect(url.searchParams.get('allow_spectre')).toBeNull();
      expect(url.searchParams.get('supported_codecs')).toBeNull();
      expect(url.searchParams.get('cdm')).toBeNull();
      expect(url.searchParams.get('player_version')).toBeNull();
    });
  });

  describe('isUsherChannelMasterUrl', () => {
    it('detects live channel master manifests that should stay browser-fetched', () => {
      expect(isUsherChannelMasterUrl('https://usher.ttvnw.net/api/channel/hls/riotgames.m3u8?token=abc')).toBe(true);
      expect(isUsherChannelMasterUrl('https://usher.ttvnw.net/api/v2/channel/hls/riotgames.m3u8?token=abc')).toBe(true);
    });

    it('does not match proxied media playlists or segments', () => {
      expect(isUsherChannelMasterUrl('https://usher.ttvnw.net/v1/playlist/Cx/live/riotgames/index-dvr.m3u8')).toBe(false);
      expect(isUsherChannelMasterUrl('https://video-weaver.ord01.hls.ttvnw.net/v1/segment/Cx/abc.ts')).toBe(false);
      expect(isUsherChannelMasterUrl('/api/proxy?url=https%3A%2F%2Fusher.ttvnw.net%2Fapi%2Fchannel%2Fhls%2Friotgames.m3u8')).toBe(false);
    });
  });
});
