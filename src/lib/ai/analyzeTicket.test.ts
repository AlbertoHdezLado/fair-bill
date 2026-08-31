import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ocr/tesseract", () => ({
  recognizeWithTesseract: vi.fn(),
}));

import { recognizeWithTesseract } from "@/lib/ocr/tesseract";
import { analyzeTicket } from "./analyzeTicket";

const mockRecognize = vi.mocked(recognizeWithTesseract);

const RAW_TEXT = "1 Cerveza 2,50\n2 Patatas 4,00\nTOTAL 10,50";

function chatCompletion(content: string) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200 },
  );
}

const VALID_AI_JSON = JSON.stringify({
  merchant_name: "Bar Pepe",
  ticket_number: "A-123",
  currency: "EUR",
  items: [
    { name: "Cerveza", quantity: 1, unit_price: 2.5, line_total: 2.5 },
    { name: "Patatas", quantity: 2, unit_price: 4, line_total: 8 },
  ],
  subtotal: 10.5,
  tax: null,
  total: 10.5,
});

describe("analyzeTicket", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("always runs Tesseract OCR to obtain rawText", async () => {
    vi.stubEnv("AI_TICKET_API_KEY", "");
    mockRecognize.mockResolvedValue({ words: [], text: RAW_TEXT });

    await analyzeTicket(Buffer.from("fake-image"));

    expect(mockRecognize).toHaveBeenCalledWith(Buffer.from("fake-image"));
  });

  it("returns an AI-sourced result when the AI call succeeds", async () => {
    vi.stubEnv("AI_TICKET_API_KEY", "test-key");
    mockRecognize.mockResolvedValue({ words: [], text: RAW_TEXT });
    const fetchMock = vi.fn(async () => chatCompletion(VALID_AI_JSON));
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeTicket(Buffer.from("fake-image"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("ai");
    expect(result.merchant_name).toBe("Bar Pepe");
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(10.5);
  });

  it("falls back to OCR parsing when the AI call times out", async () => {
    vi.stubEnv("AI_TICKET_API_KEY", "test-key");
    mockRecognize.mockResolvedValue({ words: [], text: RAW_TEXT });
    const fetchMock = vi.fn(
      () =>
        new Promise((_resolve, reject) => {
          reject(new DOMException("aborted", "AbortError"));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await analyzeTicket(Buffer.from("fake-image"));

    // One retry on the transient timeout, then fallback.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("fallback_ocr");
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("retries with a repair prompt when the AI returns invalid JSON, and succeeds", async () => {
    vi.stubEnv("AI_TICKET_API_KEY", "test-key");
    mockRecognize.mockResolvedValue({ words: [], text: RAW_TEXT });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatCompletion("not valid json"))
      .mockResolvedValueOnce(chatCompletion(VALID_AI_JSON));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await analyzeTicket(Buffer.from("fake-image"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("ai");
    expect(result.merchant_name).toBe("Bar Pepe");
  });

  it("falls back to OCR parsing when both the AI call and the repair call fail", async () => {
    vi.stubEnv("AI_TICKET_API_KEY", "test-key");
    mockRecognize.mockResolvedValue({ words: [], text: RAW_TEXT });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatCompletion("not valid json"))
      .mockResolvedValueOnce(chatCompletion("still not valid json"));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await analyzeTicket(Buffer.from("fake-image"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("fallback_ocr");
    expect(result.items.length).toBeGreaterThan(0);
  });
});
