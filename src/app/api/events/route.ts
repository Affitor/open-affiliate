import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function hashIp(ip: string): string {
  return createHash("sha256")
    .update(ip + "openaffiliate-salt")
    .digest("hex")
    .slice(0, 16);
}

const ALLOWED_TYPES = [
  "page_view",
  "search",
  "program_view",
  "outbound_click",
  "filter",
  "category_view",
  "network_view",
  "compare",
];

// POST /api/events — track an event
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const body = await req.json().catch(() => null);
  if (!body?.type) {
    return NextResponse.json({ error: "Missing type" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(body.type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const ipHash = hashIp(ip);
  const referrer = req.headers.get("referer") ?? null;
  const country = req.headers.get("x-vercel-ip-country") ?? null;

  await supabase.from("events").insert({
    type: body.type,
    slug: body.slug ?? null,
    metadata: body.metadata ?? {},
    ip_hash: ipHash,
    referrer,
    country,
    device: body.device ?? null,
    path: body.path ?? null,
    session_id: body.session_id ?? null,
  });

  return NextResponse.json({ ok: true });
}
