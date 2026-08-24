import { defaultLocale, hasLocale, type Locale } from "@/i18n";

interface LanguagePreference {
  readonly language: string;
  readonly quality: number;
  readonly index: number;
}

export function preferredLocaleFromAcceptLanguage(
  acceptLanguage: string | null,
): Locale {
  const preferences = parseAcceptLanguage(acceptLanguage);

  for (const preference of preferences) {
    const baseLanguage = preference.language.split("-")[0];
    if (baseLanguage && hasLocale(baseLanguage)) return baseLanguage;
  }

  return defaultLocale;
}

function parseAcceptLanguage(
  acceptLanguage: string | null,
): LanguagePreference[] {
  return (acceptLanguage ?? "")
    .split(",")
    .map((entry, index) => {
      const [rawLanguage, ...rawParams] = entry.split(";");
      const language = rawLanguage?.trim().toLowerCase() ?? "";
      const quality = parseQuality(rawParams);
      return { language, quality, index };
    })
    .filter((preference) => preference.language && preference.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
}

function parseQuality(params: string[]): number {
  const qualityParam = params.find((param) => param.trim().startsWith("q="));
  if (!qualityParam) return 1;

  const quality = Number.parseFloat(qualityParam.split("=")[1] ?? "");
  return Number.isFinite(quality) ? quality : 0;
}