import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips punctuation", () => {
    expect(slugify("Apples & oranges, half-ripe!")).toBe("apples-oranges-half-ripe");
  });

  it("collapses runs of whitespace and dashes", () => {
    expect(slugify("  too   many   spaces  ")).toBe("too-many-spaces");
    expect(slugify("a---b")).toBe("a-b");
  });

  it("strips diacritics", () => {
    expect(slugify("Café crème")).toBe("cafe-creme");
  });

  it("truncates to 60 chars on a word boundary", () => {
    const long = "a".repeat(80);
    expect(slugify(long).length).toBeLessThanOrEqual(60);
  });

  it("returns 'untitled' for empty input", () => {
    expect(slugify("")).toBe("untitled");
    expect(slugify("   ---   ")).toBe("untitled");
  });
});
