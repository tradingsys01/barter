import { describe, expect, it } from "vitest";
import { buildListingRow, validateImageFiles, MAX_IMAGES, MAX_FILE_BYTES } from "@/lib/listings/internal";

const validInput = {
  type: "offer_goods" as const,
  title: "Two ripe apples",
  description: undefined,
  category_id: "11111111-1111-1111-1111-111111111111",
  area_id:     "22222222-2222-2222-2222-222222222222",
  wants_text: undefined,
};

function makeFile(name: string, bytes: number, type = "image/jpeg"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("buildListingRow", () => {
  it("derives slug from title and stamps owner_id", () => {
    const row = buildListingRow(validInput, "owner-uuid");
    expect(row.owner_id).toBe("owner-uuid");
    expect(row.slug).toBe("two-ripe-apples");
    expect(row.title).toBe("Two ripe apples");
    expect(row.status).toBe("active");
  });
});

describe("validateImageFiles", () => {
  it("accepts 0 files", () => {
    expect(() => validateImageFiles([])).not.toThrow();
  });

  it("accepts up to MAX_IMAGES image files", () => {
    const files = Array.from({ length: MAX_IMAGES }, (_, i) => makeFile(`p${i}.jpg`, 1000));
    expect(() => validateImageFiles(files)).not.toThrow();
  });

  it("rejects more than MAX_IMAGES", () => {
    const files = Array.from({ length: MAX_IMAGES + 1 }, (_, i) => makeFile(`p${i}.jpg`, 1000));
    expect(() => validateImageFiles(files)).toThrow(/at most/i);
  });

  it("rejects files over MAX_FILE_BYTES", () => {
    expect(() => validateImageFiles([makeFile("big.jpg", MAX_FILE_BYTES + 1)])).toThrow(/too large/i);
  });

  it("rejects non-image mime types", () => {
    expect(() => validateImageFiles([makeFile("x.exe", 100, "application/octet-stream")])).toThrow(/image/i);
  });
});
