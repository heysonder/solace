import { NextRequest, NextResponse } from 'next/server';
import {
  applyCookieDescriptors,
  createSessionCookie,
  createTokenCookie,
  createUserCookie,
  type AuthCookiePayload,
  type TwitchTokenCookie,
} from '@/lib/auth/twitchTokens';
import { upsertUser } from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  // SECURITY: Always require NEXT_PUBLIC_SITE_URL in production to prevent open redirect
  const isProduction = process.env.NODE_ENV === 'production';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!siteUrl) {
    if (isProduction) {
      console.error('CRITICAL: NEXT_PUBLIC_SITE_URL not set in production');
      return new Response('Server configuration error', { status: 500 });
    }
    // In development, allow fallback to request headers
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('host') || request.headers.get('x-forwarded-host');
    if (!host) {
      return new Response('Unable to determine site URL', { status: 500 });
    }
  }

  const effectiveSiteUrl = siteUrl || (() => {
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('host') || request.headers.get('x-forwarded-host');
    return `${protocol}://${host}`;
  })();

  // Helper to create redirect response and clear OAuth cookies
  const createErrorRedirect = (errorCode: string) => {
    const response = NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(errorCode)}`, effectiveSiteUrl));
    response.cookies.delete('pkce_verifier');
    response.cookies.delete('oauth_state');
    return response;
  };

  if (error) {
    return createErrorRedirect(error);
  }

  if (!code) {
    return createErrorRedirect('no_code');
  }

  // SECURITY: Validate CSRF state parameter
  const storedState = request.cookies.get('oauth_state')?.value;
  if (!state || !storedState || state !== storedState) {
    console.error('OAuth state mismatch - potential CSRF attack', {
      hasState: !!state,
      hasStoredState: !!storedState,
      match: state === storedState,
    });
    return createErrorRedirect('state_mismatch');
  }

  // Retrieve PKCE code verifier from cookie
  const codeVerifier = request.cookies.get('pkce_verifier')?.value;
  if (!codeVerifier) {
    return createErrorRedirect('pkce_missing');
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const redirectUri = `${effectiveSiteUrl}/api/auth/twitch/callback`;

  if (!clientId || !clientSecret) {
    return createErrorRedirect('config_error');
  }

  try {
    // Log diagnostic info for debugging
    console.log('OAuth callback initiated:', {
      hasCode: !!code,
      hasVerifier: !!codeVerifier,
      redirectUri,
    });

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
      const errorBody = await tokenResponse.text();
      console.error('Token exchange failed:', {
        status: tokenResponse.status,
        error: errorBody,
        redirectUri,
      });
      return createErrorRedirect('token_exchange_failed');
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
      const errorBody = await userResponse.text();
      console.error('User info fetch failed:', {
        status: userResponse.status,
        error: errorBody,
      });
      return createErrorRedirect('user_fetch_failed');
    }

    const userData = await userResponse.json();
    const user = userData.data[0];

    // Save/update user in database
    try {
      await upsertUser({
        id: user.id,
        login: user.login,
        displayName: user.display_name,
        email: user.email || null,
        profileImageUrl: user.profile_image_url || null,
      });
    } catch (dbError) {
      // Log but don't fail auth if database save fails
      console.error('Failed to save user to database:', dbError);
    }

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

    const redirectUrl = new URL('/', effectiveSiteUrl);
    redirectUrl.searchParams.set('auth', 'success');

    const response = NextResponse.redirect(redirectUrl);

    applyCookieDescriptors(response, [
      createTokenCookie(tokenCookieData, request),
      createUserCookie(authData, tokenData.expires_in, request),
      createSessionCookie(user.id, request),
    ]);

    // Clear OAuth flow cookies after successful auth
    response.cookies.delete('pkce_verifier');
    response.cookies.delete('oauth_state');

    return response;

  } catch (error) {
    // Log error for debugging (Vercel logs are private)
    console.error('OAuth callback error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return createErrorRedirect('callback_error');
  }
}
