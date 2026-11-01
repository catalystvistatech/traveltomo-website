import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SHARE_IMAGE } from "@/lib/seo";

// Social share card for the site (Open Graph + Twitter). Rendered once at
// build time; child routes without their own image inherit it.

export const alt = SHARE_IMAGE.alt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const icon = await readFile(join(process.cwd(), "public/icon-1024.png"));
  const iconSrc = `data:image/png;base64,${icon.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #7a1a1f 0%, #000000 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <img src={iconSrc} width={96} height={96} alt="" style={{ borderRadius: 22 }} />
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>
            TravelTomo
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            Explore the Philippines like a game.
          </div>
          <div style={{ display: "flex", fontSize: 32, lineHeight: 1.35, color: "rgba(255,255,255,0.85)" }}>
            Roll the dice, take quests at local spots, collect stamp cards and earn real rewards.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "rgba(255,255,255,0.7)" }}>
          <div style={{ display: "flex" }}>Explore. Play. Earn. Repeat.</div>
          <div style={{ display: "flex" }}>traveltomo.app · iOS</div>
        </div>
      </div>
    ),
    size,
  );
}
