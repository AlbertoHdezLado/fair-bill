// This route uses the platform Request/FormData/File (undici), which are
// incompatible with jsdom's own implementations of those classes — run it
// under the plain "node" environment instead of the project's default jsdom.
// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function imageRequest(
  blob: BlobPart,
  options?: { type?: string; url?: string },
) {
  const formData = new FormData();
  formData.append(
    "image",
    new File([blob], "receipt.jpg", { type: options?.type ?? "image/jpeg" }),
  );
  return new Request(options?.url ?? "http://localhost/api/ocr", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/ocr", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns 501 when GOOGLE_VISION_API_KEY is not configured", async () => {
    vi.stubEnv("GOOGLE_VISION_API_KEY", "");
    const response = await POST(imageRequest("fake-bytes"));
    expect(response.status).toBe(501);
  });

  it("returns 501 when GEMINI_API_KEY is not configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const response = await POST(
      imageRequest("fake-bytes", {
        url: "http://localhost/api/ocr?provider=gemini",
      }),
    );
    expect(response.status).toBe(501);
  });

  it("returns 400 when no image is provided", async () => {
    vi.stubEnv("GOOGLE_VISION_API_KEY", "test-key");
    const response = await POST(
      new Request("http://localhost/api/ocr", { method: "POST", body: new FormData() }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when the uploaded file is not an image", async () => {
    vi.stubEnv("GOOGLE_VISION_API_KEY", "test-key");
    const response = await POST(imageRequest("not an image", { type: "text/plain" }));
    expect(response.status).toBe(400);
  });

  it("returns 413 when the image exceeds the size limit", async () => {
    vi.stubEnv("GOOGLE_VISION_API_KEY", "test-key");
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    const response = await POST(imageRequest(oversized));
    expect(response.status).toBe(413);
  });

  it("normalizes a successful Google Vision response into OcrResult", async () => {
    vi.stubEnv("GOOGLE_VISION_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            responses: [
              {
                fullTextAnnotation: {
                  text: "HOLA",
                  pages: [
                    {
                      blocks: [
                        {
                          paragraphs: [
                            {
                              words: [
                                {
                                  symbols: [{ text: "H" }, { text: "O" }, { text: "L" }, { text: "A" }],
                                  confidence: 0.9,
                                  boundingBox: {
                                    vertices: [
                                      { x: 0, y: 0 },
                                      { x: 10, y: 0 },
                                      { x: 10, y: 5 },
                                      { x: 0, y: 5 },
                                    ],
                                  },
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const response = await POST(imageRequest("fake-bytes"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.text).toBe("HOLA");
    expect(body.words).toEqual([
      { text: "HOLA", confidence: 0.9, bbox: { x0: 0, y0: 0, x1: 10, y1: 5 } },
    ]);
  });

  it("normalizes Gemini's line-based transcription into OCR words", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: "PAN 1,20\nTOTAL 1,20" }] } },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const response = await POST(
      imageRequest("fake-bytes", {
        url: "http://localhost/api/ocr?provider=gemini",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.text).toBe("PAN 1,20\nTOTAL 1,20");
    expect(body.words).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "PAN",
          bbox: expect.objectContaining({ y0: 0 }),
        }),
        expect.objectContaining({
          text: "TOTAL",
          bbox: expect.objectContaining({ y0: 24 }),
        }),
      ]),
    );
  });

  it("propagates a Google Vision API error", async () => {
    vi.stubEnv("GOOGLE_VISION_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );

    const response = await POST(imageRequest("fake-bytes"));
    expect(response.status).toBe(502);
  });
});
