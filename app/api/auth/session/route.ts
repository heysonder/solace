import { NextRequest, NextResponse } from 'next/server';
import {
  applyCookieDescriptors,
  createUserCookie,
  ensureValidTwitchTokens,
} from '@/lib/auth/twitchTokens';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { tokens, cookies } = await ensureValidTwitchTokens(request);
    if (!tokens) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Fetch user info from Twitch API
    const clientId = process.env.TWITCH_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
    }

    const userResponse = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Client-Id': clientId,
      },
    });

    if (!userResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch user info' }, { status: 500 });
    }

    const userData = await userResponse.json();
    const user = userData.data[0];

    const sessionPayload = {
      user: {
        id: user.id,
        login: user.login,
        display_name: user.display_name,
        profile_image_url: user.profile_image_url,
      },
      expires_at: tokens.expires_at,
    };

    const response = NextResponse.json(sessionPayload);

    const secondsRemaining = Math.max(60, Math.floor((tokens.expires_at - Date.now()) / 1000));
    applyCookieDescriptors(response, [
      ...(cookies ?? []),
      createUserCookie(sessionPayload, secondsRemaining),
    ]);

    return response;
  } catch (error) {
    console.error('Session lookup failed', error);
    return NextResponse.json({ error: 'Failed to load session' }, { status: 500 });
  }
}
