import { ImageResponse } from "next/og";
import { programs, getProgram , commissionDisplay} from "@/lib/programs";

export const alt = "OpenAffiliate: Affiliate Program Details";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return programs.map((p) => ({ slug: p.slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const program = getProgram(slug);

  if (!program) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f172a",
            color: "#94a3b8",
            fontSize: "32px",
          }}
        >
          Program not found
        </div>
      ),
      { ...size }
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          padding: "60px 80px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Top section */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "48px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #10b981, #059669)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "18px",
                fontWeight: 700,
              }}
            >
              O
            </div>
            <span style={{ color: "#64748b", fontSize: "16px" }}>
              OpenAffiliate
            </span>
          </div>

          {/* Program name */}
          <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "16px" }}>
            {/* Logo initial */}
            <div
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "16px",
                background: "#1e293b",
                border: "2px solid #334155",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#34d399",
                fontSize: "32px",
                fontWeight: 700,
              }}
            >
              {program.name.charAt(0)}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "48px", fontWeight: 800, color: "white", lineHeight: 1.1 }}>
                {program.name}
              </span>
              {program.verified && (
                <span style={{ fontSize: "14px", color: "#34d399", marginTop: "4px" }}>
                  Verified Program
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          <div style={{ fontSize: "22px", color: "#94a3b8", lineHeight: 1.4, maxWidth: "800px" }}>
            {program.shortDescription.length > 120
              ? program.shortDescription.slice(0, 120) + "..."
              : program.shortDescription}
          </div>
        </div>

        {/* Bottom stats */}
        <div style={{ display: "flex", gap: "48px" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "36px", fontWeight: 700, color: "#34d399" }}>
              {commissionDisplay(program.commission)}
            </span>
            <span style={{ fontSize: "13px", color: "#64748b", textTransform: "uppercase", letterSpacing: "2px" }}>
              {program.commission.type} commission
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "36px", fontWeight: 700, color: "white" }}>
              {program.cookieDays}d
            </span>
            <span style={{ fontSize: "13px", color: "#64748b", textTransform: "uppercase", letterSpacing: "2px" }}>
              Cookie
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "36px", fontWeight: 700, color: "white" }}>
              ${program.payout.minimum}
            </span>
            <span style={{ fontSize: "13px", color: "#64748b", textTransform: "uppercase", letterSpacing: "2px" }}>
              Min Payout
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "20px", fontWeight: 500, color: "#94a3b8", marginTop: "8px" }}>
              {program.category}
            </span>
            <span style={{ fontSize: "13px", color: "#64748b", textTransform: "uppercase", letterSpacing: "2px" }}>
              Category
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
