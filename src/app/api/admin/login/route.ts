import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const url = new URL(request.url);

  if (form.get("action") === "logout") {
    const res = NextResponse.redirect(new URL("/admin", url.origin), 303);
    res.cookies.delete("oa_admin");
    return res;
  }

  const key = String(form.get("key") ?? "");
  const secret = process.env.ADMIN_SECRET;

  if (!secret || !key || !safeEqual(key, secret)) {
    return NextResponse.redirect(new URL("/admin?error=1", url.origin), 303);
  }

  const res = NextResponse.redirect(new URL("/admin", url.origin), 303);
  res.cookies.set("oa_admin", secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
