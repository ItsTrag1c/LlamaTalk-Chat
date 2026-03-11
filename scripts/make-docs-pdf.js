// Generates "Clank Goals.pdf" and "Clank Privacy Policy.pdf"
// into src-tauri/resources/ for bundling with the installer.
// Run with: node scripts/make-docs-pdf.js

import PDFDocument from "pdfkit";
import { createWriteStream, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESOURCES_DIR = join(__dirname, "..", "src-tauri", "resources");
mkdirSync(RESOURCES_DIR, { recursive: true });

// ---- Shared renderer (same style as make-changelog-pdf.js) ----
function renderDoc(content, outputPath) {
  const lines = content.split("\n");
  const doc = new PDFDocument({ margin: 60, size: "A4" });
  doc.pipe(createWriteStream(outputPath));

  const L = 60, R = 60;
  const PW = doc.page.width - L - R;

  const C_TITLE  = "#1a1a2e";
  const C_H2     = "#2d4a8a";
  const C_H3     = "#444444";
  const C_TEXT   = "#222222";
  const C_RULE   = "#cccccc";
  const C_ITALIC = "#333333";

  const FONT_BOLD    = "Helvetica-Bold";
  const FONT_NORM    = "Helvetica";
  const FONT_OBLIQUE = "Helvetica-Oblique";

  function stripInline(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1");
  }

  function renderBullet(rawLine) {
    const indentSpaces = rawLine.match(/^(\s*)/)[1].length;
    const text = rawLine.replace(/^\s*-\s*/, "");
    const dotX  = L + indentSpaces * 6;
    const textX = dotX + 12;
    const textW = doc.page.width - textX - R;
    const startY = doc.y;
    doc.font(FONT_NORM).fontSize(9).fillColor(C_TEXT)
       .text("•", dotX, startY, { lineBreak: false });
    const boldMatch = text.match(/^\*\*(.+?)\*\*(.*)$/);
    if (boldMatch) {
      doc.font(FONT_BOLD).fillColor(C_TEXT)
         .text(boldMatch[1], textX, startY, { continued: true, width: textW });
      doc.font(FONT_NORM).fillColor(C_TEXT)
         .text(stripInline(boldMatch[2]), { continued: false, width: textW });
    } else {
      doc.font(FONT_NORM).fillColor(C_TEXT)
         .text(stripInline(text), textX, startY, { width: textW });
    }
    doc.moveDown(0.2);
  }

  let prevWasBlank = false;
  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith("# ")) {
      doc.font(FONT_BOLD).fontSize(22).fillColor(C_TITLE)
         .text(line.slice(2), L, doc.y, { width: PW, align: "center" });
      doc.moveDown(0.3);
      doc.moveTo(L, doc.y).lineTo(L + PW, doc.y)
         .strokeColor(C_H2).lineWidth(1.5).stroke();
      doc.moveDown(0.6);
      prevWasBlank = false; continue;
    }
    if (line.startsWith("## ")) {
      doc.moveDown(0.4);
      doc.font(FONT_BOLD).fontSize(14).fillColor(C_H2)
         .text(line.slice(3), L, doc.y, { width: PW });
      doc.moveTo(L, doc.y).lineTo(L + PW, doc.y)
         .strokeColor(C_H2).lineWidth(0.8).stroke();
      doc.moveDown(0.4);
      prevWasBlank = false; continue;
    }
    if (line.startsWith("### ")) {
      doc.moveDown(0.25);
      doc.font(FONT_BOLD).fontSize(11).fillColor(C_H3)
         .text(line.slice(4), L, doc.y, { width: PW });
      doc.moveDown(0.2);
      prevWasBlank = false; continue;
    }
    if (line === "---") {
      doc.moveTo(L, doc.y + 4).lineTo(L + PW, doc.y + 4)
         .strokeColor(C_RULE).lineWidth(0.5).stroke();
      doc.moveDown(0.5);
      prevWasBlank = false; continue;
    }
    if (/^\s*- /.test(line)) {
      renderBullet(line); prevWasBlank = false; continue;
    }
    if (/^\*[^*]/.test(line.trim()) && line.trim().endsWith("*")) {
      doc.font(FONT_OBLIQUE).fontSize(8).fillColor(C_ITALIC)
         .text(line.trim().slice(1, -1), L, doc.y, { width: PW, align: "center" });
      doc.moveDown(0.3);
      prevWasBlank = false; continue;
    }
    if (line.trim() === "") {
      if (!prevWasBlank) doc.moveDown(0.35);
      prevWasBlank = true; continue;
    }
    doc.font(FONT_NORM).fontSize(9).fillColor(C_TEXT)
       .text(stripInline(line), L, doc.y, { width: PW });
    doc.moveDown(0.2);
    prevWasBlank = false;
  }

  doc.end();
  console.log(`PDF written to: ${outputPath}`);
}

// ---- Our Goals ----
const GOALS = `# Clank — Our Goals

---

## Why We Built This

Clank exists because AI tools should be private by default, not as an afterthought.
We believe your conversations belong to you — not to cloud platforms, not to us, and not
to anyone else.

The Clank suite includes two apps built on the same principles: **Clank Desktop**,
a full graphical app for Windows, and **ClankCLI**, a terminal companion that runs in
any PowerShell or CMD window. Same values. Same local-first approach. Different surfaces.

## What We Stand For

### Local First

Everything in the Clank suite defaults to local. Your conversations, your profile,
your settings — stored on your device, not transmitted anywhere. We connect to your own
Ollama server by default, meaning your messages never leave your machine unless you
choose otherwise.

Clank Desktop stores all data in your device's local browser storage.
ClankCLI stores config and conversation history in your user AppData folder
(%APPDATA%\\ClankCLI\\). Neither app has a back-end, a cloud sync, or a database
that we control.

### Honest Cloud Access

We know that sometimes you want the best model available, and that might mean a cloud
provider. So both apps support Anthropic, Google, and OpenAI — but we are upfront about
it. When you enable a provider, the app tells you exactly what gets sent and to whom.
No hidden requests, no background sync.

### Zero Data Collection

We collect nothing. No analytics, no telemetry, no crash reports. There is no Clank
back-end watching how you use the apps. We have no accounts, no servers, no way to see
your data — because we deliberately have not built any of that.

### Transparency

Every version ships with a changelog, a privacy policy, and this goals document.
We update them alongside the apps so you always know what changed and why.

### Open to Everyone

Clank Desktop runs on Windows today, with macOS and Linux builds planned.
ClankCLI runs on Windows from any terminal, with no installation required beyond
a single EXE. No subscription required to use local models. Cloud providers use your
own API key, billed directly to you.

## What We Won't Do

- We will not sell your data
- We will not add hidden telemetry or tracking
- We will not require an account to use the apps
- We will not paywall core local functionality
- We will not misrepresent what third-party providers do with your data

---

*Clank — your conversations, your machine, your control.*
`;

// ---- Privacy Policy (read from canonical External Documents source) ----
const PRIVACY_PATH = "E:\\LlamaTalk Files\\External Documents\\Clank Privacy Policy.md";
let PRIVACY;
try {
  PRIVACY = readFileSync(PRIVACY_PATH, "utf8");
} catch {
  console.error(`Privacy Policy not found at: ${PRIVACY_PATH}`);
  console.error("Using fallback — generate the External Documents version first.");
  PRIVACY = "# Clank — Privacy Policy\n\nPrivacy policy file not found.";
}

renderDoc(GOALS,    join(RESOURCES_DIR, "Clank Goals.pdf"));
renderDoc(PRIVACY,  join(RESOURCES_DIR, "Clank Privacy Policy.pdf"));
