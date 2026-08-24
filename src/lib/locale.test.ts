import { describe, expect, it } from "vitest";
import { preferredLocaleFromAcceptLanguage } from "./locale";

describe("preferredLocaleFromAcceptLanguage", () => {
  it("uses Spanish when it is the browser's highest-priority supported language", () => {
    expect(preferredLocaleFromAcceptLanguage("es-ES,es;q=0.9,en;q=0.8")).toBe(
      "es",
    );
  });

  it("uses English when it is the browser's highest-priority supported language", () => {
    expect(preferredLocaleFromAcceptLanguage("en-US,en;q=0.9,es;q=0.8")).toBe(
      "en",
    );
  });

  it("respects q values when the header order differs from priority", () => {
    expect(preferredLocaleFromAcceptLanguage("en;q=0.7,es-ES;q=0.9")).toBe(
      "es",
    );
  });

  it("falls back to Spanish when no supported language is present", () => {
    expect(preferredLocaleFromAcceptLanguage("fr-FR,fr;q=0.9")).toBe("es");
  });
});