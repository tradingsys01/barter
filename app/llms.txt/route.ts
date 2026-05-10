const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const BODY = `# Quadra Barter

Quadra Barter is a swap-only marketplace for residents and visitors of
Quadra Island, BC. Listings are trades only — no money. Categories
include Food, Crafts, Tools, Clothing, Books, Garden, Outdoor, and
Services. Listings show one of three types: offering goods, offering a
service, or seeking something.

## Browse

- ${ORIGIN}/ — homepage with the latest listings
- ${ORIGIN}/c/food — Food
- ${ORIGIN}/c/crafts — Crafts
- ${ORIGIN}/c/tools — Tools
- ${ORIGIN}/c/clothing — Clothing
- ${ORIGIN}/c/books — Books
- ${ORIGIN}/c/garden — Garden
- ${ORIGIN}/c/outdoor — Outdoor
- ${ORIGIN}/c/services — Services
- ${ORIGIN}/area/quathiaski-cove — Quathiaski Cove
- ${ORIGIN}/area/heriot-bay — Heriot Bay
- ${ORIGIN}/area/cape-mudge — Cape Mudge / Yaculta
- ${ORIGIN}/area/granite-bay — Granite Bay
- ${ORIGIN}/area/bold-point — Bold Point
- ${ORIGIN}/area/rebecca-spit — Rebecca Spit
- ${ORIGIN}/area/gowlland-harbour — Gowlland Harbour
- ${ORIGIN}/area/main-lakes-chain — Main Lakes Chain
- ${ORIGIN}/area/open-bay — Open Bay
- ${ORIGIN}/area/surge-narrows — Surge Narrows

## Sitemap

${ORIGIN}/sitemap.xml
`;

export function GET() {
  return new Response(BODY, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
