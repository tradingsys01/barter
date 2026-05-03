import { describe, it, expect } from "vitest";
import { add } from "@/lib/sanity";

describe("sanity", () => {
  it("add(2,3) returns 5", () => {
    expect(add(2, 3)).toBe(5);
  });
});
