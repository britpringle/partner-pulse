// Generates the social link-preview image (og:image + twitter:image) at
// build/request time, so pasting the URL into LinkedIn renders a branded card
// instead of a bare link. Next wires this file in automatically by convention.

import { ImageResponse } from "next/og";

export const alt = "Partner Pulse — weekly partnership signal briefings";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#12202c",
          padding: "72px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#4fd1bd",
            fontWeight: 700,
          }}
        >
          Partner Pulse
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              lineHeight: 1.05,
              color: "#ffffff",
              fontWeight: 700,
              maxWidth: 980,
            }}
          >
            Partnership signals, scored like opportunities.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 30,
              color: "#a9b6c2",
              maxWidth: 900,
            }}
          >
            A weekly briefing that watches a watchlist of companies and ranks
            what deserves a partnerships leader&rsquo;s attention.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 24,
            color: "#4fd1bd",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 40,
              height: 6,
              background: "#0e7c6b",
            }}
          />
          Built on the Partnership Prioritization Framework
        </div>
      </div>
    ),
    { ...size }
  );
}
