import { ImageResponse } from "next/og";
import { programs, parseCommissionRate , commissionDisplay} from "@/lib/programs";

export const alt = "Affiliate Program Rankings — OpenAffiliate";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const top5 = [...programs]
    .sort((a, b) => parseCommissionRate(b.commission) - parseCommissionRate(a.commission))
    .slice(0, 5);

  const medals = ["#f59e0b", "#9ca3af", "#f97316", "#64748b", "#64748b"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          padding: "60px 80px",
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

        <div style={{ fontSize: "44px", fontWeight: 800, color: "white", marginBottom: "8px" }}>
          Affiliate Program Rankings
        </div>
        <div style={{ fontSize: "20px", color: "#94a3b8", marginBottom: "40px" }}>
          {`Top programs ranked by commission — ${programs.length} programs compared`}
        </div>

        {/* Top 5 list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {top5.map((program, i) => (
            <div
              key={program.slug}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                background: i < 3 ? "rgba(255,255,255,0.04)" : "transparent",
                borderRadius: "12px",
                padding: "12px 16px",
              }}
            >
              {/* Rank */}
              <span
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: medals[i],
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

              {/* Type */}
              <span
                style={{
                  fontSize: "13px",
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  width: "100px",
                }}
              >
                {program.commission.type}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
