import { NextRequest, NextResponse } from 'next/server';
import {
  applyCookieDescriptors,
  ensureValidTwitchTokens,
} from '@/lib/auth/twitchTokens';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const broadcasterId = request.nextUrl.searchParams.get('broadcaster_id');
  if (!broadcasterId) {
    return NextResponse.json({ subscribed: false, error: 'Missing broadcaster_id' }, { status: 400 });
  }

  const { tokens, cookies } = await ensureValidTwitchTokens(request);
  if (!tokens) {
    return NextResponse.json({ subscribed: false });
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ subscribed: false, error: 'Configuration error' }, { status: 500 });
  }

  try {
    const url = new URL('https://api.twitch.tv/helix/subscriptions/user');
    url.searchParams.set('broadcaster_id', broadcasterId);
    url.searchParams.set('user_id', tokens.user_id);

    const subResponse = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Client-Id': clientId,
      },
    });

    if (!subResponse.ok) {
      const errorBody = await subResponse.text().catch(() => '');
      console.warn(`[subscription] Helix returned ${subResponse.status} for broadcaster=${broadcasterId} user=${tokens.user_id}:`, errorBody);
      const response = NextResponse.json({ subscribed: false });
      applyCookieDescriptors(response, cookies);
      return response;
    }

    const subData = await subResponse.json();
    const subscription = subData.data?.[0];

    const response = NextResponse.json({
      subscribed: !!subscription,
      tier: subscription?.tier,
    });
    applyCookieDescriptors(response, cookies);
    return response;
  } catch (error) {
    console.error('Subscription check failed:', error);
    return NextResponse.json({ subscribed: false });
  }
}
