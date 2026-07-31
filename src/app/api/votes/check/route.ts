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

// GET /api/votes/check?slugs=vercel,stripe — check if current user voted
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
  const ipHash = hashIp(ip);

  const slugsParam = req.nextUrl.searchParams.get("slugs");
  if (!slugsParam) {
    return NextResponse.json({ voted: {} });
  }

  const slugs = slugsParam.split(",").slice(0, 50);
  const { data } = await supabase
    .from("votes")
    .select("program_slug")
    .eq("ip_hash", ipHash)
    .in("program_slug", slugs);

  const voted: Record<string, boolean> = {};
  for (const slug of slugs) voted[slug] = false;
  for (const row of data ?? []) voted[row.program_slug] = true;

  return NextResponse.json({ voted });
}
