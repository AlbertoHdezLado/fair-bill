import { headers } from "next/headers";
import { preferredLocaleFromAcceptLanguage } from "@/lib/locale";
import { messages, type Locale, type Messages } from "@/i18n";

/** Resolves the UI language from the browser alone: it never appears in the URL. */
export async function getRequestLocale(): Promise<Locale> {
  const headerList = await headers();
  return preferredLocaleFromAcceptLanguage(headerList.get("accept-language"));
}

export async function getRequestMessages(): Promise<Messages> {
  return messages[await getRequestLocale()];
}
