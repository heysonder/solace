import { NextRequest, NextResponse } from 'next/server';
import {
  applyCookieDescriptors,
  createSessionCookie,
  createTokenCookie,
  createUserCookie,
  type AuthCookiePayload,
  type TwitchTokenCookie,
} from '@/lib/auth/twitchTokens';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  // Dynamically determine the site URL from the request
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host') || request.headers.get('x-forwarded-host');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `${protocol}://${host}`;

  // Helper to create redirect response and clear PKCE cookie
  const createErrorRedirect = (errorCode: string) => {
    const response = NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(errorCode)}`, siteUrl));
    response.cookies.delete('pkce_verifier');
    return response;
  };

  if (error) {
    return createErrorRedirect(error);
  }

  if (!code) {
    return createErrorRedirect('no_code');
  }

  // Retrieve PKCE code verifier from cookie
  const codeVerifier = request.cookies.get('pkce_verifier')?.value;
  if (!codeVerifier) {
    return createErrorRedirect('pkce_missing');
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const redirectUri = `${siteUrl}/api/auth/twitch/callback`;

  if (!clientId || !clientSecret) {
    return createErrorRedirect('config_error');
  }

  try {
    // Exchange code for access token with PKCE verifier
    const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Token exchange failed');
    }

    const tokenData = await tokenResponse.json();

    // Get user info
    const userResponse = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Client-Id': clientId,
      },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch user info');
    }

    const userData = await userResponse.json();
    const user = userData.data[0];

    // SECURITY: Store auth data in HTTP-only cookie instead of URL hash
    const expiresAt = Date.now() + tokenData.expires_in * 1000;
    const authData: AuthCookiePayload = {
      user: {
        id: user.id,
        login: user.login,
        display_name: user.display_name,
        profile_image_url: user.profile_image_url,
      },
      expires_at: expiresAt,
    };

    // SECURITY: Store sensitive tokens in HTTP-only cookie
    const tokenCookieData: TwitchTokenCookie = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      expires_at: expiresAt,
      scope: tokenData.scope,
      token_type: tokenData.token_type,
      user_id: user.id,
    };

    const redirectUrl = new URL('/', siteUrl);
    redirectUrl.searchParams.set('auth', 'success');

    const response = NextResponse.redirect(redirectUrl);

    applyCookieDescriptors(response, [
      createTokenCookie(tokenCookieData, request),
      createUserCookie(authData, tokenData.expires_in, request),
      createSessionCookie(user.id, request),
    ]);

    // Clear the PKCE verifier cookie after successful auth
    response.cookies.delete('pkce_verifier');

    return response;

  } catch (error) {
    // SECURITY: Log error without exposing sensitive details
    if (process.env.NODE_ENV === 'development') {
      console.error('OAuth callback error:', error);
    }
    return createErrorRedirect('callback_error');
  }
}
