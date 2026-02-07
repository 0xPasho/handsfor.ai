import { NextRequest, NextResponse } from "next/server";

/**
 * In-memory sliding-window rate limiter.
 * Fine for single-instance deployments. For multi-instance,
 * replace with Upstash Redis or similar.
 */

interface RateWindow {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateWindow>();

// Evict stale entries every 60s to prevent memory leak
const EVICT_INTERVAL = 60_000;
let lastEvict = Date.now();

function evictStale() {
  const now = Date.now();
  if (now - lastEvict < EVICT_INTERVAL) return;
  lastEvict = now;
  for (const [key, win] of store) {
    if (win.resetAt <= now) store.delete(key);
  }
}

function isRateLimited(
  key: string,
  maxRequests: number,
  windowMs: number,
): { limited: boolean; remaining: number; resetAt: number } {
  evictStale();
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { limited: false, remaining: maxRequests - 1, resetAt };
  }

  existing.count++;
  if (existing.count > maxRequests) {
    return { limited: true, remaining: 0, resetAt: existing.resetAt };
  }

  return {
    limited: false,
    remaining: maxRequests - existing.count,
    resetAt: existing.resetAt,
  };
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// Rate limit tiers
const TIERS: { match: (path: string) => boolean; max: number; windowMs: number }[] = [
  // Financial endpoints: 10 req / 60s
  {
    match: (p) =>
      p.startsWith("/api/users/deposit") ||
      p.startsWith("/api/users/withdraw") ||
      p.includes("/pick-winner") ||
      p.includes("/dispute"),
    max: 10,
    windowMs: 60_000,
  },
  // Write endpoints (POST/PATCH/DELETE): 30 req / 60s
  {
    match: (p) => p.startsWith("/api/"),
    max: 30,
    windowMs: 60_000,
  },
];

// Read endpoints: 60 req / 60s
const READ_LIMIT = { max: 60, windowMs: 60_000 };

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Only rate-limit API routes
  if (!path.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Skip MCP endpoint (has its own auth, and streaming needs uninterrupted flow)
  if (path === "/api/mcp") {
    return NextResponse.next();
  }

  const ip = getClientIp(req);
  const method = req.method;

  // Find applicable tier
  let max: number;
  let windowMs: number;

  if (method === "GET") {
    max = READ_LIMIT.max;
    windowMs = READ_LIMIT.windowMs;
  } else {
    const tier = TIERS.find((t) => t.match(path));
    max = tier?.max ?? 30;
    windowMs = tier?.windowMs ?? 60_000;
  }

  // Key: ip + tier bucket
  const bucket = method === "GET" ? "read" : TIERS.find((t) => t.match(path)) === TIERS[0] ? "financial" : "write";
  const key = `${ip}:${bucket}`;

  const result = isRateLimited(key, max, windowMs);

  if (result.limited) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Limit": String(max),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
        },
      },
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(max));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
