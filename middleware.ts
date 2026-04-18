import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// SECURITY: Rate limiting storage
// NOTE: This in-memory Map works for single-instance deployments but won't
// properly rate limit in serverless/multi-instance environments where each
// instance maintains its own state. For production at scale, consider using
// a distributed rate limiting solution (Redis, Vercel KV, Upstash, etc.)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Generate a secure random session ID using Web Crypto API (Edge Runtime compatible)
function generateSessionId(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

function rateLimit(key: string, limit: number = 100, windowMs: number = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Clean up old entries
  for (const [key, value] of rateLimitMap.entries()) {
    if (value.resetTime < windowStart) {
      rateLimitMap.delete(key);
    }
  }

  const current = rateLimitMap.get(key);

  if (!current) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (current.resetTime < now) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (current.count >= limit) {
    return false;
  }

  current.count++;
  return true;
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Session management: Ensure every visitor has a session cookie
  const sessionCookie = request.cookies.get('session_id');
  if (!sessionCookie) {
    const sessionId = generateSessionId();
    // Use secure cookies in production OR when serving over HTTPS
    const isSecure = process.env.NODE_ENV === 'production' ||
                     request.nextUrl.protocol === 'https:';
    response.cookies.set('session_id', sessionId, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    });
  }

  // SECURITY: Add comprehensive security headers
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // SECURITY: HSTS for HTTPS
  if (request.nextUrl.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // SECURITY: Content Security Policy (enhanced)
  // NOTE: 'unsafe-inline' is required for Twitch SDK embed to function properly.
  // The Twitch SDK injects inline scripts that would fail without it.
  // This is a known tradeoff for Twitch embed functionality.
  const csp = [
    "default-src 'self'",
    // unsafe-inline required for Twitch SDK - see CLAUDE.md for justification
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''} https://embed.twitch.tv https://player.twitch.tv https://www.twitch.tv https://static.twitchcdn.net https://va.vercel-scripts.com https://vercel.live`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://api.twitch.tv https://gql.twitch.tv https://id.twitch.tv https://static-cdn.jtvnw.net https://usher.ttvnw.net https://*.ttvnw.net https://ttv-proxy.chasefrazier.dev https://vitals.vercel-insights.com wss://irc-ws.chat.twitch.tv https://api.betterttv.net https://api.frankerfacez.com https://7tv.io https://cdn.7tv.app https://clipr.xyz",
    "frame-src https://embed.twitch.tv https://player.twitch.tv https://vercel.live",
    "frame-ancestors 'self'", // Prevent clickjacking
    "media-src 'self' https: blob: https://*.ttvnw.net https://ttv-proxy.chasefrazier.dev",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  // Safari can aggressively upgrade same-origin localhost asset requests
  // when this directive is present on plain HTTP, which breaks local CSS/JS.
  if (request.nextUrl.protocol === 'https:') {
    csp.push("upgrade-insecure-requests");
  }

  response.headers.set('Content-Security-Policy', csp.join('; '));

  // SECURITY: Rate limiting for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
    const path = request.nextUrl.pathname;

    // Keep HLS proxy traffic isolated from the rest of the app.
    // Chromium/Firefox request many playlists and segments through /api/proxy,
    // which can legitimately exceed the default API limit during playback.
    let bucket = 'api';
    let limit = 100;

    if (path.startsWith('/api/proxy')) {
      bucket = 'proxy';
      limit = 5000;
    } else if (path.startsWith('/api/auth/')) {
      bucket = 'auth';
      limit = 20;
    }

    if (!rateLimit(`${ip}:${bucket}`, limit)) {
      return new NextResponse('Rate limit exceeded', { status: 429 });
    }
  }

  // SECURITY: Block dev routes in production
  if (process.env.NODE_ENV === 'production' && request.nextUrl.pathname.startsWith('/dev/')) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // SECURITY: Prevent access to sensitive files
  const sensitiveFiles = ['.env', '.git', 'package.json', 'next.config.js'];
  const pathname = request.nextUrl.pathname.toLowerCase();
  if (sensitiveFiles.some(file => pathname.includes(file))) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
