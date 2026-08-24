import { NextRequest } from "next/server";
import {
  getRedirectUrl,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

describe("proxy locale redirects", () => {
  it("runs on the root path", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig: {},
        url: "/",
      }),
    ).toBe(true);
  });

  it("redirects root requests to the preferred supported locale", () => {
    const request = new NextRequest("https://example.test/", {
      headers: { "accept-language": "en-US,en;q=0.9,es;q=0.8" },
    });

    expect(getRedirectUrl(proxy(request))).toBe("https://example.test/en");
  });
});