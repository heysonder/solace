import { NextRequest, NextResponse } from 'next/server';
import {
  applyCookieDescriptors,
  clearSessionCookie,
  clearTokenCookie,
  clearUserCookie,
} from '@/lib/auth/twitchTokens';

export const dynamic = 'force-dynamic';

// SECURITY: Validate request origin to prevent CSRF attacks
function isValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  // In development, be more lenient
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  // Check if origin matches our site
  if (origin) {
    if (siteUrl && origin === siteUrl) return true;
    if (host && (origin === `https://${host}` || origin === `http://${host}`)) return true;
  }

  // Fallback to referer check
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (siteUrl) {
        const siteUrlObj = new URL(siteUrl);
        if (refererUrl.host === siteUrlObj.host) return true;
      }
      if (host && refererUrl.host === host) return true;
    } catch {
      // Invalid referer URL
    }
  }

  return false;
}

export async function POST(request: NextRequest) {
  // SECURITY: Validate origin to prevent CSRF
  if (!isValidOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }

  const response = NextResponse.json({ success: true });

  applyCookieDescriptors(response, [
    clearTokenCookie(request),
    clearUserCookie(request),
    clearSessionCookie(request),
  ]);

  return response;
}
