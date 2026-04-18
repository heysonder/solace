import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

describe('middleware CSP', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows unsafe-eval in development for Next.js dev runtime', () => {
    vi.stubEnv('NODE_ENV', 'development');

    const response = middleware(new NextRequest('http://localhost:3000/watch/emiru'));
    const csp = response.headers.get('Content-Security-Policy');

    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });

  it('does not allow unsafe-eval in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = middleware(new NextRequest('https://solacestreams.vercel.app/watch/emiru'));
    const csp = response.headers.get('Content-Security-Policy');

    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });
});
