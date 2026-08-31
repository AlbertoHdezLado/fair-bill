import type { OcrProvider } from "./types";

// Gemini runs server-side so its API key never reaches the browser.
export const geminiProvider: OcrProvider = {
  id: "gemini",
  async recognize(image) {
    const formData = new FormData();
    formData.append("image", image, "receipt.jpg");

    const response = await fetch("/api/ocr?provider=gemini", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? `OCR request failed (${response.status})`);
    }

    return await response.json();
  },
};