import { geminiProvider } from "./gemini";
import { googleVisionProvider } from "./google-vision";
import { tesseractProvider } from "./tesseract";
import type { OcrProvider } from "./types";

export type {
  OcrBoundingBox,
  OcrProgressCallback,
  OcrProvider,
  OcrResult,
  OcrWord,
} from "./types";
export {
  preprocessReceiptImage,
  type ReceiptImageVariant,
} from "./preprocess";

/**
 * Picks the OCR provider to use on the client. Defaults to Tesseract
 * (free, private, runs on-device); `gemini` and `google-vision` use the
 * server-side OCR route instead.
 */
export function getOcrProvider(): OcrProvider {
  switch (process.env.NEXT_PUBLIC_OCR_PROVIDER) {
    case "gemini":
      return geminiProvider;
    case "google-vision":
      return googleVisionProvider;
    default:
      return tesseractProvider;
  }
}
