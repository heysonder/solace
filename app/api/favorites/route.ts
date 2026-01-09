import { NextResponse } from 'next/server';

// Tombstone route - this endpoint was removed in favor of localStorage
// Returns 410 Gone to inform cached clients the resource no longer exists

export async function GET() {
  return NextResponse.json(
    { error: 'This endpoint has been removed. Favorites are now stored in your browser.' },
    { status: 410 }
  );
}

export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint has been removed. Favorites are now stored in your browser.' },
    { status: 410 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'This endpoint has been removed. Favorites are now stored in your browser.' },
    { status: 410 }
  );
}
