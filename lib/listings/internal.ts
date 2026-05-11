import { slugify } from "@/lib/slug";
import type { CreateListingInput, CreateRideListingInput } from "@/lib/listings/validation";

export const MAX_IMAGES = 3;
export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB (after client resize)

export type ListingRow = {
  owner_id: string;
  type: CreateListingInput["type"];
  title: string;
  slug: string;
  description: string | null;
  category_id: string;
  area_id: string;
  wants_text: string | null;
  status: "active";
  route_from: string | null;
  route_to: string | null;
  schedule: string | null;
  seats: number | null;
  gas_share: boolean;
};

export function buildListingRow(
  input: CreateListingInput | CreateRideListingInput,
  ownerId: string,
): ListingRow {
  const isRide = "route_from" in input;
  return {
    owner_id: ownerId,
    type: input.type,
    title: input.title,
    slug: slugify(input.title),
    description: input.description ?? null,
    category_id: input.category_id,
    area_id: input.area_id,
    wants_text: input.wants_text ?? null,
    status: "active",
    route_from: isRide ? input.route_from : null,
    route_to: isRide ? input.route_to : null,
    schedule: isRide ? input.schedule : null,
    seats: isRide ? input.seats : null,
    gas_share: isRide ? input.gas_share : false,
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
