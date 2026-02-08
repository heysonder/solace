/**
 * LocalStorage key constants
 * Centralized to prevent typos and make key changes easier
 */

export const STORAGE_KEYS = {
  // Chat settings
  CHAT_SHOW_BADGES: 'chat_show_badges',

  // Emote provider settings
  EMOTES_BTTV: 'emotes_bttv',
  EMOTES_FFZ: 'emotes_ffz',
  EMOTES_7TV: 'emotes_7tv',

  // Player settings
  PLAYER_NATIVE_HLS: 'player_native_hls',

  // Theme settings
  THEME: 'theme',

  // Auth
  TWITCH_AUTH: 'twitch_auth',
  TWITCH_USERNAME: 'twitch_username',
  TWITCH_OAUTH: 'twitch_oauth',

  // Favorites
  TWITCH_FAVORITES: 'twitch-favorites',

  // Cookie consent
  COOKIE_CONSENT: 'cookie-consent',
} as const;
