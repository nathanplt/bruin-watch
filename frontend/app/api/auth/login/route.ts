import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  signSessionToken
} from "@/lib/session";

type LoginBody = {
  email?: string;
  password?: string;
};

type LoginAttemptState = {
  windowStartedAt: number;
  failedCount: number;
  blockedUntil: number;
};

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;
const loginAttempts = new Map<string, LoginAttemptState>();

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function getClientIp(request: Request): string {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const [first] = xForwardedFor.split(",");
    const candidate = first?.trim();
    if (candidate) {
      return candidate;
    }
  }
  return request.headers.get("x-real-ip") || "unknown";
}

function cleanupAttempts(now: number): void {
  for (const [key, state] of loginAttempts.entries()) {
    const latestSeenAt = Math.max(state.windowStartedAt, state.blockedUntil);
    if (now - latestSeenAt > LOGIN_ATTEMPT_TTL_MS) {
      loginAttempts.delete(key);
    }
  }
}

function getOrCreateAttemptState(clientIp: string, now: number): LoginAttemptState {
  const existing = loginAttempts.get(clientIp);
  if (!existing) {
    const created: LoginAttemptState = {
      windowStartedAt: now,
      failedCount: 0,
      blockedUntil: 0
    };
    loginAttempts.set(clientIp, created);
    return created;
  }

  if (now > existing.blockedUntil && now - existing.windowStartedAt > LOGIN_WINDOW_MS) {
    existing.windowStartedAt = now;
    existing.failedCount = 0;
    existing.blockedUntil = 0;
  }

  return existing;
}

function blockRemainingSeconds(clientIp: string, now: number): number | null {
  const state = getOrCreateAttemptState(clientIp, now);
  if (state.blockedUntil <= now) {
    return null;
  }
  return Math.ceil((state.blockedUntil - now) / 1000);
}

function registerFailedAttempt(clientIp: string, now: number): void {
  const state = getOrCreateAttemptState(clientIp, now);
  if (now - state.windowStartedAt > LOGIN_WINDOW_MS) {
    state.windowStartedAt = now;
    state.failedCount = 0;
  }
  state.failedCount += 1;
  if (state.failedCount >= LOGIN_MAX_ATTEMPTS) {
    state.blockedUntil = now + LOGIN_BLOCK_MS;
  }
}

function clearFailedAttempts(clientIp: string): void {
  loginAttempts.delete(clientIp);
}

function authUnavailableDetail(): string {
  if (isProduction()) {
    return "Authentication is unavailable.";
  }
  return "Server auth env missing. Set ADMIN_EMAIL and ADMIN_PASSWORD_HASH.";
}

export async function POST(request: Request) {
  const now = Date.now();
  cleanupAttempts(now);
  const clientIp = getClientIp(request);
  const blockedSeconds = blockRemainingSeconds(clientIp, now);
  if (blockedSeconds) {
    return NextResponse.json(
      { detail: "Too many login attempts. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(blockedSeconds),
          "Cache-Control": "no-store",
          Pragma: "no-cache"
        }
      }
    );
  }

  const body = (await request.json().catch(() => ({}))) as LoginBody;

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const adminPasswordPlain = process.env.ADMIN_PASSWORD || "";
  const rawHash = process.env.ADMIN_PASSWORD_HASH || "";
  const adminPasswordHash = rawHash.replace(/\\\$/g, "$");
  const hasBcryptHash = adminPasswordHash.startsWith("$2");

  if (!adminEmail || (!adminPasswordHash && !adminPasswordPlain)) {
    return NextResponse.json({ detail: authUnavailableDetail() }, { status: 500 });
  }

  if (isProduction() && !hasBcryptHash) {
    return NextResponse.json(
      { detail: authUnavailableDetail() },
      { status: 500 }
    );
  }

  let passwordMatches = false;
  if (hasBcryptHash) {
    try {
      passwordMatches = await bcrypt.compare(password, adminPasswordHash);
    } catch {
      return NextResponse.json(
        { detail: authUnavailableDetail() },
        { status: 500 }
      );
    }
  } else if (!isProduction() && adminPasswordPlain) {
    passwordMatches = safeEqual(password, adminPasswordPlain);
  } else if (!isProduction() && adminPasswordHash) {
    passwordMatches = safeEqual(password, adminPasswordHash);
  }

  const authorized = safeEqual(email, adminEmail) && passwordMatches;
  if (!authorized) {
    registerFailedAttempt(clientIp, now);
    return NextResponse.json(
      { detail: "Invalid credentials." },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
          Pragma: "no-cache"
        }
      }
    );
  }

  clearFailedAttempts(clientIp);
  const token = await signSessionToken({ email: adminEmail });
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  return response;
}
