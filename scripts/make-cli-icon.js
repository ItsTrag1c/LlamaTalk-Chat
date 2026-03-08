// scripts/make-cli-icon.js
// Generates icons/cli-icon.ico from the Desktop app's base icon with a terminal badge overlay.
import { Jimp, loadFont } from "jimp";
import pngToIco from "png-to-ico";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_ICON = join(__dirname, "../../llamachatv1/src-tauri/icons/128x128.png");
const OUT_DIR   = join(__dirname, "../icons");
const OUT_ICO   = join(OUT_DIR, "cli-icon.ico");

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// Load the Desktop base icon (128x128)
const base = await Jimp.read(BASE_ICON);

// ── Terminal badge ─────────────────────────────────────────────────────────
// Orange circle, 40×40, placed at bottom-right of the 128×128 canvas
const BADGE = 40;
const BX    = 128 - BADGE - 3;  // 85
const BY    = 128 - BADGE - 3;  // 85
const CX    = BADGE / 2;
const CY    = BADGE / 2;
const R     = BADGE / 2 - 1;

const badge = new Jimp({ width: BADGE, height: BADGE, color: 0x00000000 });

// Fill orange circle (accent color: #f97316 = rgb(249, 115, 22))
badge.scan(0, 0, BADGE, BADGE, (x, y, idx) => {
  const dx = x - CX;
  const dy = y - CY;
  if (dx * dx + dy * dy <= R * R) {
    badge.bitmap.data[idx + 0] = 249;
    badge.bitmap.data[idx + 1] = 115;
    badge.bitmap.data[idx + 2] = 22;
    badge.bitmap.data[idx + 3] = 255;
  }
});

// Print ">_" in white using bitmap font
const fontPath = join(__dirname, "../node_modules/@jimp/plugin-print/fonts/open-sans/open-sans-16-white/open-sans-16-white.fnt");
const font = await loadFont(fontPath);
badge.print({ font, x: 2, y: 10, text: ">_" });

// Composite badge over base icon
base.composite(badge, BX, BY);

// Convert final PNG → ICO (include 16, 32, 48, and 128-px sizes)
const sized = await Promise.all([16, 32, 48, 128].map(async (sz) => {
  const copy = base.clone().resize({ w: sz, h: sz });
  return copy.getBuffer("image/png");
}));

const icoBuffer = await pngToIco(sized);
writeFileSync(OUT_ICO, icoBuffer);
console.log("CLI icon written:", OUT_ICO);
