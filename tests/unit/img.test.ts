import { describe, expect, it, beforeEach } from "vitest";
import { listingImageUrl } from "@/lib/img";

describe("listingImageUrl", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:8000";
  });

  it("builds the public storage URL", () => {
    expect(listingImageUrl("abc/0.jpg")).toBe(
      "http://localhost:8000/storage/v1/object/public/listings/abc/0.jpg",
    );
  });

  it("strips a leading slash from the path", () => {
    expect(listingImageUrl("/abc/0.jpg")).toBe(
      "http://localhost:8000/storage/v1/object/public/listings/abc/0.jpg",
    );
  });
});
