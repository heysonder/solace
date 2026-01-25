import { NextRequest, NextResponse } from 'next/server';
import { getFavorites, addFavorite, removeFavorite, syncFavorites } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth/twitchTokens';

export const dynamic = 'force-dynamic';

// GET /api/user/favorites - get user's favorites
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const favorites = await getFavorites(user.id);
    return NextResponse.json({ favorites });
  } catch (error) {
    console.error('Error getting favorites:', error);
    return NextResponse.json({ error: 'failed to get favorites' }, { status: 500 });
  }
}

// POST /api/user/favorites - add or sync favorites
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Sync all favorites at once
    if (body.favorites && Array.isArray(body.favorites)) {
      await syncFavorites(user.id, body.favorites);
      return NextResponse.json({ success: true });
    }

    // Add single favorite
    if (body.channelLogin) {
      await addFavorite(user.id, body.channelLogin);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  } catch (error) {
    console.error('Error adding favorite:', error);
    return NextResponse.json({ error: 'failed to add favorite' }, { status: 500 });
  }
}

// DELETE /api/user/favorites - remove a favorite
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const channelLogin = searchParams.get('channel');

    if (!channelLogin) {
      return NextResponse.json({ error: 'channel required' }, { status: 400 });
    }

    await removeFavorite(user.id, channelLogin);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing favorite:', error);
    return NextResponse.json({ error: 'failed to remove favorite' }, { status: 500 });
  }
}
