import { NextRequest, NextResponse } from 'next/server';
import {
  applyCookieDescriptors,
  clearSessionCookie,
  clearTokenCookie,
  clearUserCookie,
} from '@/lib/auth/twitchTokens';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });

  applyCookieDescriptors(response, [
    clearTokenCookie(request),
    clearUserCookie(request),
    clearSessionCookie(request),
  ]);

  return response;
}
