import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

const PAGE_PROTECTED = ["/"];
const STATE_CHANGING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function isProtectedPage(pathname: string): boolean {
  return PAGE_PROTECTED.includes(pathname);
}

function isProtectedApi(pathname: string): boolean {
  return pathname.startsWith("/api/backend") || pathname === "/api/auth/logout";
}

function hasInvalidStateChangingOrigin(request: NextRequest): boolean {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return false;
  }
  if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }

  return origin !== request.nextUrl.origin;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (hasInvalidStateChangingOrigin(request)) {
    return NextResponse.json({ detail: "Invalid request origin." }, { status: 403 });
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (pathname === "/login") {
    if (session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (isProtectedApi(pathname) || isProtectedPage(pathname)) {
    if (!session) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/api/backend/:path*", "/api/auth/logout", "/api/auth/login"]
};
