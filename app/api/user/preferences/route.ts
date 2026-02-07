import { NextRequest, NextResponse } from 'next/server';
import { getPreferences, updatePreferences, syncPreferences } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth/twitchTokens';

export const dynamic = 'force-dynamic';

// GET /api/user/preferences - get user's preferences
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const preferences = await getPreferences(user.id);
    return NextResponse.json({ preferences });
  } catch (error) {
    console.error('Error getting preferences:', error);
    return NextResponse.json({ error: 'failed to get preferences' }, { status: 500 });
  }
}

// POST /api/user/preferences - update preferences
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Full sync
    if (body.preferences) {
      await syncPreferences(user.id, body.preferences);
      return NextResponse.json({ success: true });
    }

    // Partial update
    const validKeys = [
      'chatFontSize',
      'showTimestamps',
      'bttvEmotesEnabled',
      'ffzEmotesEnabled',
      'seventvEmotesEnabled',
    ];

    const updates: Record<string, unknown> = {};
    for (const key of validKeys) {
      if (key in body) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'no valid updates provided' }, { status: 400 });
    }

    await updatePreferences(user.id, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating preferences:', error);
    return NextResponse.json({ error: 'failed to update preferences' }, { status: 500 });
  }
}
