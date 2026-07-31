import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + "openaffiliate-salt").digest("hex").slice(0, 16);
}

// GET /api/votes?slugs=vercel,stripe,notion
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const slugsParam = req.nextUrl.searchParams.get("slugs");

  if (slugsParam) {
    // Get vote counts for specific slugs
    const slugs = slugsParam.split(",").slice(0, 50);
    const { data, error } = await supabase
      .from("votes")
      .select("program_slug")
      .in("program_slug", slugs);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Count per slug
    const counts: Record<string, number> = {};
    for (const slug of slugs) counts[slug] = 0;
    for (const row of data ?? []) {
      counts[row.program_slug] = (counts[row.program_slug] || 0) + 1;
    }

    return NextResponse.json({ counts }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  }

  // Get all vote counts (for rankings)
  const { data, error } = await supabase
    .from("votes")
    .select("program_slug");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.program_slug] = (counts[row.program_slug] || 0) + 1;
  }

  return NextResponse.json({ counts }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}

// POST /api/votes { slug: "vercel" }
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";

  const body = await req.json().catch(() => null);
  if (!body?.slug || typeof body.slug !== "string") {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const ipHash = hashIp(ip);

  // Check if already voted
  const { data: existing } = await supabase
    .from("votes")
    .select("id")
    .eq("program_slug", body.slug)
    .eq("ip_hash", ipHash)
    .maybeSingle();

  if (existing) {
    // Unvote (toggle)
    await supabase.from("votes").delete().eq("id", existing.id);
    return NextResponse.json({ voted: false });
  }

  // Vote
  const { error } = await supabase
    .from("votes")
    .insert({ program_slug: body.slug, ip_hash: ipHash });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ voted: true });
}

// DELETE /api/votes { slug: "vercel" }
export async function DELETE(req: NextRequest) {
  const supabase = getSupabase();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";

  const body = await req.json().catch(() => null);
  if (!body?.slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const ipHash = hashIp(ip);

  await supabase
    .from("votes")
    .delete()
    .eq("program_slug", body.slug)
    .eq("ip_hash", ipHash);

  return NextResponse.json({ voted: false });
}
