import { describe, test, expect } from "bun:test";
import { defaultPostVisibility, postAudienceAllows } from "../src/lib/privacy";
describe("Privacidade de publicações", () => {
  test("novas contas usam visibilidade pública", () => {
    expect(defaultPostVisibility(null)).toBe("public");
  });
  test("Amigos exige seguir e ser seguido de volta", () => {
    expect(postAudienceAllows("friends", false, true, false)).toBe(false);
    expect(postAudienceAllows("friends", false, false, true)).toBe(false);
    expect(postAudienceAllows("friends", false, true, true)).toBe(true);
  });
  test("Só eu exclui todos os outros espectadores", () => {
    expect(postAudienceAllows("me", false, true, true)).toBe(false);
    expect(postAudienceAllows("me", true, false, false)).toBe(true);
  });
});