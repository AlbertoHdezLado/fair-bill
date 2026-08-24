import { describe, expect, it } from "vitest";
import {
  ROOM_CODE_LENGTH,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from "./code";

describe("generateRoomCode", () => {
  it("produces codes of the expected length", () => {
    expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH);
  });

  it("never uses characters that get confused when read out loud", () => {
    const codes = Array.from({ length: 200 }, () => generateRoomCode()).join("");
    expect(codes).not.toMatch(/[IO01]/);
  });

  it("produces codes it considers valid", () => {
    for (let i = 0; i < 50; i++) {
      expect(isValidRoomCode(generateRoomCode())).toBe(true);
    }
  });
});

describe("isValidRoomCode", () => {
  it("accepts a lowercase, padded code", () => {
    expect(isValidRoomCode("  ab2cd3 ")).toBe(true);
  });

  it("rejects the wrong length", () => {
    expect(isValidRoomCode("AB2CD")).toBe(false);
    expect(isValidRoomCode("AB2CD34")).toBe(false);
  });

  it("rejects ambiguous or out-of-alphabet characters", () => {
    expect(isValidRoomCode("AB2CD0")).toBe(false);
    expect(isValidRoomCode("AB2CD1")).toBe(false);
    expect(isValidRoomCode("AB2CD-")).toBe(false);
  });
});

describe("normalizeRoomCode", () => {
  it("uppercases and trims", () => {
    expect(normalizeRoomCode(" ab2cd3 ")).toBe("AB2CD3");
  });
});
