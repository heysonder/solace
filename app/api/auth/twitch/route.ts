import { NextRequest, NextResponse } from 'next/server';
import { shouldUseSecureCookies } from '@/lib/auth/twitchTokens';

// PKCE helper functions
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

// CSRF state parameter generation
function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(new Uint8Array(hash));
}

function base64URLEncode(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function GET(request: NextRequest) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!clientId) {
    return NextResponse.json({ error: 'Twitch client ID not configured' }, { status: 500 });
  }

  const scopes = [
    'chat:read',
    'chat:edit',
    'user:read:email',
    'user:read:subscriptions'
  ];

  // In production, require NEXT_PUBLIC_SITE_URL to prevent header injection
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host') || request.headers.get('x-forwarded-host');
  const siteUrl = isProduction
    ? process.env.NEXT_PUBLIC_SITE_URL || `${protocol}://${host}`
    : process.env.NEXT_PUBLIC_SITE_URL || `${protocol}://${host}`;

  if (isProduction && !process.env.NEXT_PUBLIC_SITE_URL) {
    console.warn('NEXT_PUBLIC_SITE_URL not set in production - using request headers as fallback');
  }

  const redirectUri = `${siteUrl}/api/auth/twitch/callback`;

  // Generate PKCE code verifier and challenge
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // SECURITY: Generate CSRF state parameter
  const state = generateState();

  const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes.join(' '));
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authUrl.toString());

  const secureCookies = shouldUseSecureCookies(request);

  // Store the code verifier in an HTTP-only cookie for the callback
  // Use consistent secure flag logic with other auth cookies
  response.cookies.set('pkce_verifier', codeVerifier, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes - enough time to complete OAuth flow
    path: '/',
  });

  // SECURITY: Store CSRF state in HTTP-only cookie
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  return response;
}