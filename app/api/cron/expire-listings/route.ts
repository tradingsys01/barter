import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/resend";

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const expected = process.env.CRON_SECRET;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = admin();
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const results = { warned: 0, archived: 0, errors: [] as string[] };

  // 1. Send warning emails for listings expiring in ~3 days (between 2.5 and 3.5 days)
  const warnStart = new Date(Date.now() + 2.5 * 24 * 60 * 60 * 1000).toISOString();
  const warnEnd = new Date(Date.now() + 3.5 * 24 * 60 * 60 * 1000).toISOString();

  const { data: expiringSoon, error: warnErr } = await supabase
    .from("listings")
    .select(`
      id, title, slug, expires_at,
      owner:users!owner_id ( email, display_name )
    `)
    .eq("status", "active")
    .gte("expires_at", warnStart)
    .lt("expires_at", warnEnd);

  if (warnErr) {
    results.errors.push(`Warning query failed: ${warnErr.message}`);
  } else {
    for (const listing of expiringSoon ?? []) {
      const owner = listing.owner as any;
      if (!owner?.email) continue;

      const listingUrl = `${appUrl}/l/${listing.id}/${listing.slug}`;
      const myListingsUrl = `${appUrl}/me/listings`;
      const expiresDate = new Date(listing.expires_at!).toLocaleDateString("en-CA", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });

      try {
        await sendEmail({
          to: owner.email,
          subject: `Your listing "${listing.title}" expires in 3 days`,
          text: `Hi${owner.display_name ? ` ${owner.display_name}` : ""},

Your listing "${listing.title}" will expire on ${expiresDate}.

To keep it active, visit your listings page and click "+30 days" to extend it:
${myListingsUrl}

Or view the listing:
${listingUrl}

If you no longer need this listing, no action is needed — it will be automatically archived.

— Quadra Barter`,
          html: `
<p>Hi${owner.display_name ? ` ${owner.display_name}` : ""},</p>
<p>Your listing "<strong>${listing.title}</strong>" will expire on <strong>${expiresDate}</strong>.</p>
<p>To keep it active, visit your listings page and click "+30 days" to extend it:</p>
<p><a href="${myListingsUrl}">${myListingsUrl}</a></p>
<p>Or <a href="${listingUrl}">view the listing</a>.</p>
<p>If you no longer need this listing, no action is needed — it will be automatically archived.</p>
<p>— Quadra Barter</p>
          `.trim(),
        });
        results.warned++;
      } catch (e) {
        results.errors.push(`Email to ${owner.email} failed: ${e}`);
      }
    }
  }

  // 2. Archive expired listings
  const now = new Date().toISOString();
  const { data: expired, error: expireErr } = await supabase
    .from("listings")
    .update({ status: "archived" })
    .eq("status", "active")
    .lt("expires_at", now)
    .select("id");

  if (expireErr) {
    results.errors.push(`Archive update failed: ${expireErr.message}`);
  } else {
    results.archived = expired?.length ?? 0;
  }

  return NextResponse.json({
    ok: true,
    warned: results.warned,
    archived: results.archived,
    errors: results.errors.length > 0 ? results.errors : undefined,
  });
}
