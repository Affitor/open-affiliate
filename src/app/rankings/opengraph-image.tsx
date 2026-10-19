import { ImageResponse } from "next/og";
import { livePrograms, commissionDisplay } from "@/lib/programs";
import { commissionGroup, compareCommissionFigure, recurringMonths, recurringText } from "@/lib/rankings-terms";
import { isSameTeam } from "@/lib/same-team";

export const alt = "Affiliate Program Rankings: OpenAffiliate";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** "Lifetime", "12 months", or "One-time" for a commission that pays once. */
function recurs(p: (typeof livePrograms)[number]): string {
  const text = recurringText(recurringMonths(p.commission));
  return text === "No" ? "One-time" : text;
}

export default async function Image() {
  // The /rankings default view: verified programs paying a percentage of the
  // sale, highest first, longer recurring first on a tie; our own programs unranked.
  const ranked = livePrograms.filter((p) => p.verified && !isSameTeam(p.slug));
  const top5 = ranked
    .filter((p) => commissionGroup(p.commission) === "percent")
    .sort((a, b) => compareCommissionFigure(a, b))
    .slice(0, 5);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          padding: "48px 80px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
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
          <span style={{ color: "#64748b", fontSize: "16px" }}>OpenAffiliate</span>
        </div>

        <div style={{ display: "flex", flexShrink: 0, fontSize: "44px", lineHeight: "52px", fontWeight: 800, color: "white", marginBottom: "12px" }}>
          Affiliate Program Rankings
        </div>
        <div style={{ display: "flex", flexShrink: 0, fontSize: "20px", lineHeight: "28px", color: "#94a3b8", marginBottom: "32px" }}>
          {`${ranked.length} verified programs ranked by what they pay. Top 5 by percentage of sale.`}
        </div>

        {/* Top 5 list */}
        {/* Header, title and list fit 630px: a taller column made Satori shrink the title into the subtitle. */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {top5.map((program, i) => (
            <div
              key={program.slug}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                background: i < 3 ? "rgba(255,255,255,0.04)" : "transparent",
                borderRadius: "12px",
                padding: "8px 16px",
              }}
            >
              {/* Rank */}
              <span
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "#94a3b8",
                  width: "40px",
                  textAlign: "center",
                }}
              >
                {i + 1}
              </span>

              {/* Logo initial */}
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "#1e293b",
                  border: "1px solid #334155",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#34d399",
                  fontSize: "18px",
                  fontWeight: 700,
                }}
              >
                {program.name.charAt(0)}
              </div>

              {/* Name */}
              <span style={{ fontSize: "20px", fontWeight: 600, color: "white", flex: 1 }}>
                {program.name}
              </span>

              {/* Commission */}
              <span style={{ fontSize: "22px", fontWeight: 700, color: "#34d399" }}>
                {commissionDisplay(program.commission)}
              </span>

              {/* How long it recurs */}
              <span
                style={{
                  fontSize: "13px",
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  width: "130px",
                }}
              >
                {recurs(program)}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
