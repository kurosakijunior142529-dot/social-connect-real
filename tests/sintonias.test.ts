import { describe, expect, test } from "bun:test";
import { SINTONIA_DURATION_MS, SINTONIA_AUDIO_MAX_MS, SINTONIA_TEXT_MAX, isSintoniaActive, validSintoniaAudio } from "../src/lib/sintonias";

describe("Sintonias", () => {
  test("expire exactly after 24 hours", () => {
    const start = Date.parse("2026-10-21T11:25:00Z");
    expect(SINTONIA_DURATION_MS).toBe(24 * 60 * 60 * 1000);
    const expires = new Date(start + SINTONIA_DURATION_MS).toISOString();
    expect(isSintoniaActive(expires, start + SINTONIA_DURATION_MS - 1)).toBe(true);
    expect(isSintoniaActive(expires, start + SINTONIA_DURATION_MS)).toBe(false);
  });
  test("voice is limited to 10 seconds", () => {
    expect(SINTONIA_AUDIO_MAX_MS).toBe(10_000);
    expect(validSintoniaAudio(10_000)).toBe(true);
    expect(validSintoniaAudio(10_001)).toBe(false);
    expect(validSintoniaAudio(0)).toBe(false);
  });
  test("text keeps the 60 character limit", () => {
    expect(SINTONIA_TEXT_MAX).toBe(60);
  });
});