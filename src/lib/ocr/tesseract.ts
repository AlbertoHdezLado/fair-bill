import { createWorker, type RecognizeResult } from "tesseract.js";
import type {
  OcrProgressCallback,
  OcrProvider,
  OcrResult,
  OcrWord,
} from "./types";

// Default provider: runs entirely on the client, free and private (the photo
// never leaves the phone).

export const tesseractProvider: OcrProvider = {
  id: "tesseract",
  recognize: (image, onProgress) => runTesseractRecognition(image, onProgress),
};

/**
 * Same Tesseract recognition used by the client provider, exposed for
 * server-side callers (e.g. the AI ticket pipeline) that hand it a Buffer
 * instead of a Blob.
 */
export function recognizeWithTesseract(
  image: Buffer | Blob,
  onProgress?: OcrProgressCallback,
): Promise<OcrResult> {
  return runTesseractRecognition(image, onProgress);
}

async function runTesseractRecognition(
  image: Buffer | Blob,
  onProgress?: OcrProgressCallback,
): Promise<OcrResult> {
  const worker = await createWorker("spa", undefined, {
    logger: (message) => {
      onProgress?.({ status: message.status, progress: message.progress });
    },
  });

  try {
    const result = await worker.recognize(image, {}, { blocks: true });
    return toOcrResult(result);
  } finally {
    await worker.terminate();
  }
}

function toOcrResult(result: RecognizeResult): OcrResult {
  const words: OcrWord[] = [];

  for (const block of result.data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const word of line.words) {
          const text = word.text.trim();
          if (!text) continue;
          words.push({
            text,
            confidence: word.confidence,
            bbox: word.bbox,
          });
        }
      }
    }
  }

  return { words, text: result.data.text };
}
