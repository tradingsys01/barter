export function listingImageUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const clean = path.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/listings/${clean}`;
}
