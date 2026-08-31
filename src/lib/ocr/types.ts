// Shared OCR provider contract: every provider (Tesseract, Google Vision, ...)
// must normalize its output down to plain words with bounding boxes so the
// rule-based parser never needs to know which engine produced them.

export interface OcrBoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: OcrBoundingBox;
}

export interface OcrResult {
  words: OcrWord[];
  /** Full raw text, mostly useful for debugging. */
  text: string;
}

export type OcrProgressCallback = (progress: {
  status: string;
  progress: number;
}) => void;

export interface OcrProvider {
  id: "tesseract" | "google-vision" | "gemini";
  recognize(image: Blob, onProgress?: OcrProgressCallback): Promise<OcrResult>;
}
