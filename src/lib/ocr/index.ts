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
 * (free, private, runs on-device); set NEXT_PUBLIC_OCR_PROVIDER=google-vision
 * to route through the server-side Google Vision route handler instead.
 */
export function getOcrProvider(): OcrProvider {
  return process.env.NEXT_PUBLIC_OCR_PROVIDER === "google-vision"
    ? googleVisionProvider
    : tesseractProvider;
}
