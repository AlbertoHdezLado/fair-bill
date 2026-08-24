import { NextResponse, type NextRequest } from "next/server";

const locales = ["es", "en"] as const;

function getPreferredLocale(request: NextRequest): (typeof locales)[number] {
  const acceptedLanguages = request.headers.get("accept-language") ?? "";
  const requestedLanguages = acceptedLanguages
    .split(",")
    .map((entry) => entry.split(";")[0]?.trim().toLowerCase())
    .filter(Boolean);

  return requestedLanguages.some(
    (language) => language === "en" || language.startsWith("en-"),
  )
    ? "en"
    : "es";
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (locales.some((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${getPreferredLocale(request)}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*[.].*).*)"],
};