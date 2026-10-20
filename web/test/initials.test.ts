import { describe, expect, it } from "vitest";
import { initials } from "../src/components/Shell";

describe("initials", () => {
  it("takes the first letters of the first and last words", () => {
    expect(initials("Utilizador de teste")).toBe("UT");
    expect(initials("  maria  joão silva ")).toBe("MS");
  });
  it("uses one letter for a single word, and ? for nothing", () => {
    expect(initials("dev@linhazero.localhost")).toBe("D");
    expect(initials("")).toBe("?");
  });
});
