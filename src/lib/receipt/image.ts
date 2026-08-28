// Turns a captured receipt photo into a small data URL, kept only in this
// device's storage so the "view original ticket" button has something to show.

const MAX_DIMENSION = 1000;
const JPEG_QUALITY = 0.7;

export async function fileToPreviewDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}
