import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { verifySignedSession, getSessionSecret } from "./utils/session";

// ========== Rate Limit Maps ==========
const globalLimits = new Map<string, { count: number; resetAt: number }>();
const apiLimits = new Map<string, { count: number; resetAt: number }>();
const searchLimits = new Map<string, { count: number; resetAt: number }>();
const commentWriteLimits = new Map<string, { count: number; resetAt: number }>();
const interactionLimits = new Map<string, { count: number; resetAt: number }>();
const rssLimits = new Map<string, { count: number; resetAt: number }>();

function checkLimit(map: Map<string, { count: number; resetAt: number }>, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now > entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}

// Periodic cleanup to prevent memory leak (every 5 min, remove expired entries)
let lastCleanup = Date.now();
function cleanupMaps() {
  const now = Date.now();
  if (now - lastCleanup < 300_000) return;
  lastCleanup = now;
  for (const map of [globalLimits, apiLimits, searchLimits, commentWriteLimits, interactionLimits, rssLimits]) {
    for (const [key, val] of map) {
      if (now > val.resetAt) map.delete(key);
    }
  }
}

// Routes that do NOT need DB user lookup (static, public, pre-auth)
const SKIP_DB_PREFIXES = [
  '/_astro/',
  '/favicon',
  '/robots.txt',
  '/login',
  '/register',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/register',
  '/api/auth/send-code',
  '/api/auth/passkey/auth-',
  '/rss.xml',
];

function shouldSkipDB(pathname: string): boolean {
  if (pathname.startsWith('/api/auth/passkey/register')) return false;
  return SKIP_DB_PREFIXES.some(p => pathname.startsWith(p));
}

// 429 Friendly HTML Page
function rateLimitResponse(): Response {
  const html = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>请求过于频繁</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #f0f4ff 0%, #e8eeff 50%, #f5f0ff 100%);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .card {
      background: white; border-radius: 2rem; padding: 3rem 2.5rem;
      box-shadow: 0 25px 60px rgba(0,0,0,0.08); text-align: center;
      max-width: 440px; width: 90%; border: 1px solid rgba(0,0,0,0.04);
    }
    .icon {
      width: 80px; height: 80px; margin: 0 auto 1.5rem;
      background: linear-gradient(135deg, #ff9a56 0%, #ff6b6b 100%);
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 12px 30px rgba(255,107,107,0.3);
    }
    .icon svg { width: 36px; height: 36px; color: white; }
    h1 { font-size: 1.5rem; font-weight: 800; color: #1a1a2e; margin-bottom: 0.75rem; }
    p { color: #6b7280; font-size: 0.9rem; line-height: 1.7; margin-bottom: 1.5rem; }
    .code { font-family: monospace; font-size: 0.75rem; color: #9ca3af; }
    a {
      display: inline-block; padding: 0.75rem 2rem; background: linear-gradient(135deg, #667eea, #764ba2);
      color: white; text-decoration: none; border-radius: 999px; font-weight: 700; font-size: 0.85rem;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 8px 20px rgba(102,126,234,0.3);
    }
    a:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(102,126,234,0.4); }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    </div>
    <h1>请求过于频繁</h1>
    <p>为保护服务器资源，您的请求已被暂时限制。<br/>请稍等片刻后再试。</p>
    <a href="javascript:history.back()">返回上一页</a>
    <p class="code" style="margin-top:1.5rem">HTTP 429 — Too Many Requests</p>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 429,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '60' }
  });
}

function rateLimitJsonResponse(): Response {
  return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '60' }
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  // ===== Language Preference Detection =====
  if (!context.cookies.has('lang')) {
    const acceptLanguage = context.request.headers.get('accept-language');
    let preferredLang = 'en';
    if (acceptLanguage) {
      const langs = acceptLanguage.split(',').map(l => l.split(';')[0].trim().toLowerCase());
      for (const l of langs) {
        if (l.startsWith('zh-tw') || l.startsWith('zh-hk') || l.startsWith('zh-mo')) { preferredLang = 'zh-tw'; break; }
        if (l.startsWith('zh')) { preferredLang = 'zh'; break; }
        if (l.startsWith('en')) { preferredLang = 'en'; break; }
        if (l.startsWith('ja')) { preferredLang = 'ja'; break; }
        if (l.startsWith('de')) { preferredLang = 'de'; break; }
      }
    }
    context.cookies.set('lang', preferredLang, { path: '/', maxAge: 31536000 });
  }

  // Skip rate limiting for static assets entirely
  if (pathname.startsWith('/_astro/') || pathname.startsWith('/favicon')) {
    return next();
  }

  cleanupMaps();

  const ip = context.request.headers.get('cf-connecting-ip') ||
             context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             'unknown';
  const isApiRoute = pathname.startsWith('/api/');
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
  const sessionId = context.cookies.get('user_session')?.value;

  // ===== Populate user (with HMAC verification & whitelist optimization — Layer 4) =====
  if (sessionId && !shouldSkipDB(pathname)) {
    try {
      const sessionSecret = getSessionSecret(env);
      const sessionInfo = await verifySignedSession(sessionId, sessionSecret);
      if (sessionInfo) {
        const db = (env as any).DB;
        if (db) {
          const user = await db.prepare(`
            SELECT u.id, u.username, u.role, u.token_version, u.email,
                   (SELECT 1 FROM deleted_users d WHERE d.email = u.email AND d.expires_at > datetime('now')) as is_restricted
            FROM users u WHERE u.id = ?
          `).bind(sessionInfo.userId).first();

          if (user) {
            const isRestricted = Boolean(user.is_restricted);
            const userTokenVersion = Number(user.token_version || 1);
            if (isRestricted || userTokenVersion !== sessionInfo.tokenVersion) {
              context.cookies.delete('user_session', { path: '/' });
            } else {
              context.locals.user = user;
            }
          }
        }
      }
    } catch(e) {
      console.error('Middleware DB Error:', e);
    }
  }

  // ===== Admin exemption — skip all rate limits =====
  if (context.locals.user?.role === 'admin') {
    // Protect /admin routes (auth check only)
    if (isAdminRoute) {
      return next(); // admin is verified, proceed
    }
    return next();
  }

  // ===== Protect /admin routes =====
  if (isAdminRoute) {
    if (!context.locals.user) {
      if (isApiRoute) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }
      return context.redirect('/login');
    }
    if (context.locals.user.role !== 'admin') {
      if (isApiRoute) {
        return new Response(JSON.stringify({ error: 'Forbidden: Admins only' }), { status: 403 });
      }
      return context.redirect('/');
    }
  }

  // ===== Layer 1.5: RSS specific limit (10/min/IP) =====
  if (pathname === '/rss.xml') {
    if (!checkLimit(rssLimits, ip, 10, 60_000)) {
      return new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '60' } });
    }
  }

  // ===== Layer 1: Global IP rate limit =====
  const globalLimit = isApiRoute ? 60 : 120; // API: 60/min, Pages: 120/min
  if (!checkLimit(globalLimits, ip, globalLimit, 60_000)) {
    return isApiRoute ? rateLimitJsonResponse() : rateLimitResponse();
  }

  // ===== Layer 2: High-risk API specific limits =====
  if (isApiRoute) {
    // General API limit
    if (!checkLimit(apiLimits, ip, 60, 60_000)) {
      return rateLimitJsonResponse();
    }

    // Search API — 20 requests/min/IP
    if (pathname === '/api/search') {
      if (!checkLimit(searchLimits, ip, 20, 60_000)) {
        return rateLimitJsonResponse();
      }
      // Limit query length
      const q = url.searchParams.get('q') || '';
      if (q.length > 50) {
        return new Response(JSON.stringify({ error: '搜索内容过长' }), { status: 400 });
      }
    }

    // Comment POST — 5 writes/min/user
    if (pathname === '/api/comments' && context.request.method === 'POST') {
      const userKey = sessionId || ip;
      if (!checkLimit(commentWriteLimits, userKey, 5, 60_000)) {
        return rateLimitJsonResponse();
      }
    }

    // Interaction POST — 40/min/user
    if (pathname === '/api/interactions' && context.request.method === 'POST') {
      const userKey = sessionId || ip;
      if (!checkLimit(interactionLimits, userKey, 40, 60_000)) {
        return rateLimitJsonResponse();
      }
    }
  }

  return next();
});
