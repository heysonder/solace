/**
 * Custom hls.js loader that:
 * 1. Routes all requests through /api/proxy to bypass CORS
 * 2. Rewrites URLs inside M3U8 playlists so sub-requests also go through the proxy
 * 3. Strips ad segments from media playlists
 *
 * Pure M3U8 helpers live in ./hlsPlaylist so they can be used server-side
 * without pulling in hls.js.
 */

import Hls from 'hls.js';
import { hasAdSegments, proxyUrl, rewritePlaylistUrls, stripAdSegments } from './hlsPlaylist';

export { hasAdSegments, proxyUrl, rewritePlaylistUrls, stripAdSegments };

export function createAdFilterLoader(): typeof Hls.DefaultConfig.loader {
  const DefaultLoader = Hls.DefaultConfig.loader;

  class AdFilterProxyLoader extends (DefaultLoader as any) {
    load(context: any, config: any, callbacks: any): void {
      const url: string = context.url;
      if (url.startsWith('https://')) {
        console.log('[AdFilter] Proxying:', url.substring(0, 80) + '...');
        context.url = proxyUrl(url);
      }

      const originalOnSuccess = callbacks.onSuccess;

      callbacks.onSuccess = (response: any, stats: any, ctx: any, networkDetails: any) => {
        if (typeof response.data === 'string') {
          if (response.data.includes('#EXTM3U')) {
            response.data = rewritePlaylistUrls(response.data);
          }

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
