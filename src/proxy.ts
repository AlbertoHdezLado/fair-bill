import { NextResponse, type NextRequest } from "next/server";
import { preferredLocaleFromAcceptLanguage } from "@/lib/locale";

const locales = ["es", "en"] as const;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    locales.some(
      (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
    )
  ) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  const locale = preferredLocaleFromAcceptLanguage(
    request.headers.get("accept-language"),
  );
  url.pathname = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/", "/((?!api|_next/static|_next/image|.*[.].*).*)"],
};