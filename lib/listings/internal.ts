import { slugify } from "@/lib/slug";
import type { CreateListingInput } from "@/lib/listings/validation";

export const MAX_IMAGES = 6;
export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export type ListingRow = {
  owner_id: string;
  type: CreateListingInput["type"];
  title: string;
  slug: string;
  description: string | null;
  category_id: string;
  area_id: string;
  wants_text: string | null;
  accepts_credits: boolean;
  status: "active";
};

export function buildListingRow(input: CreateListingInput, ownerId: string): ListingRow {
  return {
    owner_id: ownerId,
    type: input.type,
    title: input.title,
    slug: slugify(input.title),
    description: input.description ?? null,
    category_id: input.category_id,
    area_id: input.area_id,
    wants_text: input.wants_text ?? null,
    accepts_credits: input.accepts_credits,
    status: "active",
  };
}

export function validateImageFiles(files: File[]): void {
  if (files.length > MAX_IMAGES) {
    throw new Error(`Please attach at most ${MAX_IMAGES} photos.`);
  }
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      throw new Error(`"${f.name}" is too large (max 5 MB).`);
    }
    if (!f.type.startsWith("image/")) {
      throw new Error(`"${f.name}" is not an image file.`);
    }
  }
}

export function fileExt(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return (m?.[1] ?? "jpg").toLowerCase();
}
