import { ImageResponse } from "next/og";
import { programs, categories } from "@/lib/programs";

export const alt = "OpenAffiliate: The Open Registry of Affiliate Programs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          padding: "60px 80px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Logo area */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "40px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #10b981, #059669)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "24px",
              fontWeight: 700,
            }}
          >
            O
          </div>
          <span style={{ color: "#94a3b8", fontSize: "20px", fontWeight: 500 }}>
            OpenAffiliate
          </span>
        </div>

        {/* Title — Satori requires display:flex when an element has >1 child
            (here: text + colored <span> + text). flexWrap keeps it readable. */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            fontSize: "56px",
            fontWeight: 800,
            color: "white",
            lineHeight: 1.1,
            marginBottom: "20px",
          }}
        >
          <span>The open registry of&nbsp;</span>
          <span style={{ color: "#34d399" }}>&nbsp;affiliate&nbsp;</span>
          <span>&nbsp;programs.</span>
        </div>

        {/* Subtitle */}
        <div style={{ fontSize: "24px", color: "#94a3b8", marginBottom: "40px" }}>
          Discover, compare, and integrate. Built for developers and AI agents.
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: "48px" }}>
          {[
            { value: programs.length.toString(), label: "Programs" },
            { value: categories.length.toString(), label: "Categories" },
            { value: "100%", label: "Open Source" },
          ].map((stat) => (
            <div key={stat.label} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "36px", fontWeight: 700, color: "#34d399" }}>
                {stat.value}
              </span>
              <span style={{ fontSize: "14px", color: "#64748b", textTransform: "uppercase", letterSpacing: "2px" }}>
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
