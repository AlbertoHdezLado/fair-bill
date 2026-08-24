/**
 * Room codes are read out loud and typed by hand, so the alphabet drops the
 * characters that get confused with each other (I/1, O/0, and their lookalikes).
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);

  let code = "";
  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length];
  }
  return code;
}

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidRoomCode(value: string): boolean {
  const code = normalizeRoomCode(value);
  if (code.length !== ROOM_CODE_LENGTH) return false;
  return [...code].every((char) => ALPHABET.includes(char));
}
