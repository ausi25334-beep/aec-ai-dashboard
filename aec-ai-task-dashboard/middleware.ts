import { NextRequest, NextResponse } from "next/server";
import {
  readSessionToken,
  SESSION_COOKIE_NAME,
} from "./lib/auth-session";

export async function middleware(request: NextRequest) {
  const user = await readSessionToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
  const pathname = request.nextUrl.pathname;

  if (pathname === "/login" && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (
    (pathname.startsWith("/dashboard") ||
      pathname.startsWith("/settings")) &&
    !user
  ) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export const config = {
  matcher: ["/login", "/dashboard/:path*", "/settings/:path*"],
};
