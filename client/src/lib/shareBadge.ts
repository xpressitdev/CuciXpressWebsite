import {
  Achievement,
  TONE_HEX,
} from "@/components/dashboard/achievementsData";

// Build an SVG string for a single achievement badge. 1080x1350 keeps it
// friendly for Instagram/Facebook stories and feed posts. Pure SVG (no
// canvas APIs needed) — converted to a PNG blob below for sharing.
function buildBadgeSvg(a: Achievement, customerName: string): string {
  const palette = TONE_HEX[a.tone];
  const isLegendary = a.tone === "legendary";
  const date = a.unlockedAt
    ? new Date(a.unlockedAt).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

  // Escape the few characters that can break SVG when interpolated.
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  // Confetti dots scattered around the canvas. Deterministic positions
  // so renders are repeatable.
  const dots: string[] = [];
  const seed = [
    [120, 180], [240, 380], [880, 220], [960, 460], [180, 920],
    [820, 980], [320, 1180], [760, 1140], [540, 250], [620, 1230],
    [80, 580], [1000, 720], [200, 1080], [900, 1200], [420, 1280],
  ];
  for (const [x, y] of seed) {
    const r = 3 + ((x + y) % 5);
    dots.push(
      `<circle cx="${x}" cy="${y}" r="${r}" fill="white" opacity="0.35"/>`,
    );
  }

  // Legendary badge gets a holographic background with multiple stops.
  const bgGradient = isLegendary
    ? `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0c4a6e"/>
        <stop offset="35%" stop-color="#7c3aed"/>
        <stop offset="65%" stop-color="#db2777"/>
        <stop offset="100%" stop-color="#f59e0b"/>
       </linearGradient>`
    : `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${palette.from}"/>
        <stop offset="100%" stop-color="${palette.to}"/>
       </linearGradient>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" font-family="'Inter','Helvetica Neue','Arial',sans-serif">
  <defs>
    ${bgGradient}
    <radialGradient id="spot" cx="50%" cy="30%" r="65%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.45)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <radialGradient id="medal" cx="35%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.7)"/>
    </radialGradient>
  </defs>

  <rect width="1080" height="1350" fill="url(#bg)"/>
  <rect width="1080" height="1350" fill="url(#spot)"/>
  ${dots.join("")}

  <!-- top brand strip -->
  <text x="540" y="130" fill="white" opacity="0.9" font-size="34" font-weight="900" text-anchor="middle" letter-spacing="10">CUCI XPRESS</text>
  <text x="540" y="172" fill="white" opacity="0.65" font-size="22" font-weight="600" text-anchor="middle" letter-spacing="6">DRIVE-THRU CAR WASH · BRUNEI</text>
  <line x1="380" y1="200" x2="700" y2="200" stroke="white" stroke-opacity="0.4" stroke-width="2"/>

  <!-- award label -->
  <text x="540" y="290" fill="white" opacity="0.85" font-size="26" font-weight="800" text-anchor="middle" letter-spacing="6">${esc(a.rewardLabel.toUpperCase())}</text>

  <!-- medallion -->
  <circle cx="540" cy="560" r="240" fill="white" opacity="0.18"/>
  <circle cx="540" cy="560" r="200" fill="url(#medal)"/>
  <circle cx="540" cy="560" r="200" fill="none" stroke="white" stroke-opacity="0.6" stroke-width="4"/>
  <text x="540" y="640" font-size="220" text-anchor="middle">${a.emoji}</text>

  <!-- title + tagline -->
  <text x="540" y="920" fill="white" font-size="92" font-weight="900" text-anchor="middle">${esc(a.label)}</text>
  <text x="540" y="985" fill="white" opacity="0.9" font-size="36" font-weight="600" text-anchor="middle">${esc(a.desc)}</text>

  <!-- footer card -->
  <rect x="120" y="1100" width="840" height="170" rx="28" ry="28" fill="rgba(0,0,0,0.28)"/>
  <text x="160" y="1155" fill="white" opacity="0.7" font-size="22" font-weight="700" letter-spacing="4">EARNED BY</text>
  <text x="160" y="1205" fill="white" font-size="40" font-weight="900">${esc(customerName || "A loyal customer")}</text>
  <text x="160" y="1250" fill="white" opacity="0.75" font-size="24" font-weight="600">Unlocked ${esc(date)} · cucixpress.com</text>
</svg>`;
}

// Render the SVG into a PNG blob via an offscreen canvas. The PNG is
// what we hand to the Web Share API or download anchor — every social
// app handles it cleanly, while raw SVG is fragile in chat apps.
export async function renderBadgePng(
  a: Achievement,
  customerName: string,
): Promise<Blob> {
  const svg = buildBadgeSvg(a, customerName);
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas context unavailable");
    ctx.drawImage(img, 0, 0, 1080, 1350);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
        "image/png",
        0.95,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Build the caption text used by share-sheet fallbacks (WhatsApp, X).
export function badgeCaption(a: Achievement): string {
  return `Just unlocked the *${a.label}* badge on CuciXpress! 🎉\n${a.desc}\n\nEarn yours at cucixpress.com`;
}
