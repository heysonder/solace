import type { NextRequest, NextResponse } from 'next/server';
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';

// Determine if we should use secure cookies
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Determines if secure cookies should be used based on the request context.
 * In production, always use secure cookies.
 * In development, check the actual request protocol.
 */
export function shouldUseSecureCookies(request?: NextRequest): boolean {
  // Always use secure in production
  if (isProduction) return true;

  // Check if NEXT_PUBLIC_BASE_URL explicitly uses HTTPS
  if (process.env.NEXT_PUBLIC_BASE_URL?.startsWith('https://')) return true;

  // Check actual request protocol via forwarded headers
  if (request) {
    const forwardedProto = request.headers.get('x-forwarded-proto');
    if (forwardedProto === 'https') return true;
  }

  // Default to false for local development over HTTP
  return false;
}

export const TOKEN_COOKIE_NAME = 'twitch_tokens';
export const USER_COOKIE_NAME = 'twitch_user';
export const SESSION_COOKIE_NAME = 'session_id';

type CookieDescriptor = {
  name: string;
  value: string;
  options?: Partial<ResponseCookie>;
};

export type TwitchTokenCookie = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  expires_at: number;
  scope?: string[];
  token_type?: string;
  user_id: string;
};

export type AuthCookiePayload = {
  user: {
    id: string;
    login: string;
    display_name: string;
    profile_image_url?: string | null;
  };
  expires_at: number;
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function createTokenCookie(tokens: TwitchTokenCookie, request?: NextRequest): CookieDescriptor {
  // Keep the refresh token available well beyond the short-lived access token
  // so we can silently refresh sessions instead of forcing users to log in each visit.
  const maxAgeSeconds = ONE_YEAR_SECONDS;

  return {
    name: TOKEN_COOKIE_NAME,
    value: JSON.stringify(tokens),
    options: {
      httpOnly: true,
      secure: shouldUseSecureCookies(request),
      sameSite: 'lax',
      maxAge: maxAgeSeconds,
      path: '/',
    },
  };
}

export function createUserCookie(payload: AuthCookiePayload, maxAgeSeconds: number, request?: NextRequest): CookieDescriptor {
  return {
    name: USER_COOKIE_NAME,
    value: JSON.stringify(payload),
    options: {
      httpOnly: true, // Protect user data from XSS
      secure: shouldUseSecureCookies(request),
      sameSite: 'lax',
      maxAge: Math.max(60, maxAgeSeconds),
      path: '/',
    },
  };
}

export function createSessionCookie(userId: string, request?: NextRequest): CookieDescriptor {
  return {
    name: SESSION_COOKIE_NAME,
    value: userId,
    options: {
      httpOnly: true,
      secure: shouldUseSecureCookies(request),
      sameSite: 'lax',
      maxAge: ONE_YEAR_SECONDS,
      path: '/',
    },
  };
}

export function clearTokenCookie(request?: NextRequest): CookieDescriptor {
  return {
    name: TOKEN_COOKIE_NAME,
    value: '',
    options: {
      httpOnly: true,
      secure: shouldUseSecureCookies(request),
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    },
  };
}

export function clearUserCookie(request?: NextRequest): CookieDescriptor {
  return {
    name: USER_COOKIE_NAME,
    value: '',
    options: {
      httpOnly: true, // Match the httpOnly flag from createUserCookie
      secure: shouldUseSecureCookies(request),
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    },
  };
}

export function clearSessionCookie(request?: NextRequest): CookieDescriptor {
  return {
    name: SESSION_COOKIE_NAME,
    value: '',
    options: {
      httpOnly: true,
      secure: shouldUseSecureCookies(request),
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    },
  };
}

export function applyCookieDescriptors(response: NextResponse, cookies?: CookieDescriptor[]) {
  cookies?.forEach(cookie => {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  });
}

function parseCookieJSON<T>(value?: string): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function extractSessionIdentifier(request: NextRequest): string | undefined {
  const tokenCookie = request.cookies.get(TOKEN_COOKIE_NAME);
  if (tokenCookie) {
    const parsed = parseCookieJSON<TwitchTokenCookie>(tokenCookie.value);
    if (parsed?.user_id) {
      return parsed.user_id;
    }
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  return sessionCookie?.value;
}

export type AuthenticatedUser = {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl?: string | null;
};

/**
 * Get the authenticated user from the request cookies.
 * Returns null if not authenticated or if tokens are invalid.
 */
export async function getAuthenticatedUser(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  const userCookie = request.cookies.get(USER_COOKIE_NAME);
  if (!userCookie?.value) {
    return null;
  }

  const authData = parseCookieJSON<AuthCookiePayload>(userCookie.value);
  if (!authData?.user?.id) {
    return null;
  }

  // Check if session is expired
  if (authData.expires_at && authData.expires_at < Date.now()) {
    // Try to refresh tokens
    const { tokens } = await ensureValidTwitchTokens(request);
    if (!tokens) {
      return null;
    }
  }

  return {
    id: authData.user.id,
    login: authData.user.login,
    displayName: authData.user.display_name,
    profileImageUrl: authData.user.profile_image_url,
  };
}

export async function ensureValidTwitchTokens(
  request: NextRequest
): Promise<{ tokens: TwitchTokenCookie | null; cookies?: CookieDescriptor[] }> {
  const tokenCookie = request.cookies.get(TOKEN_COOKIE_NAME);
  if (!tokenCookie?.value) {
    return { tokens: null };
  }

  let tokens = parseCookieJSON<TwitchTokenCookie>(tokenCookie.value);
  if (!tokens?.access_token) {
    return { tokens: null };
  }

  const hasExpiresAt = typeof tokens.expires_at === 'number';
  const needsRefresh = !hasExpiresAt || (tokens.expires_at - Date.now() < 60 * 1000);
  if (!needsRefresh) {
    return { tokens };
  }

  if (!tokens.refresh_token) {
    return { tokens: null };
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Twitch client credentials missing; cannot refresh token');
    return { tokens: null };
  }

  const refreshResponse = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!refreshResponse.ok) {
    console.error('Failed to refresh Twitch token');
    return { tokens: null };
  }

  const refreshed = await refreshResponse.json();

  tokens = {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || tokens.refresh_token,
    expires_in: refreshed.expires_in,
    expires_at: Date.now() + refreshed.expires_in * 1000,
    scope: refreshed.scope || tokens.scope,
    token_type: refreshed.token_type || tokens.token_type,
    user_id: tokens.user_id,
  };

  const cookies: CookieDescriptor[] = [createTokenCookie(tokens, request)];

  const userCookie = request.cookies.get(USER_COOKIE_NAME);
  if (userCookie?.value) {
    const authData = parseCookieJSON<AuthCookiePayload>(userCookie.value);
    if (authData) {
      authData.expires_at = tokens.expires_at;
      cookies.push(createUserCookie(authData, tokens.expires_in, request));
    }
  }

  return { tokens, cookies };
}
