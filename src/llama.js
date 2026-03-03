const ORANGE = "\x1b[38;5;208m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

// ASCII llama facing right, 8 lines tall
// [>_] terminal badge hovers in the upper-right
const LLAMA_LINES = [
  "          ██   [>_]   ",
  "    ██████████████    ",
  "    █ ◉ ███████████   ",
  "    ██████████        ",
  "  ██████████████████  ",
  "  ██  ██  ██  ██  ██  ",
  "  ██  ██  ██  ██  ██  ",
  "                      ",
];

// Slightly shifted frame for bob animation — badge stays in the top line
const LLAMA_LINES_BOB = [
  "               [>_]   ",
  "          ██          ",
  "    ██████████████    ",
  "    █ ◉ ███████████   ",
  "    ██████████        ",
  "  ██████████████████  ",
  "  ██  ██  ██  ██  ██  ",
  "  ██  ██  ██  ██  ██  ",
];

const GOLD  = "\x1b[38;5;220m";
const DIM   = "\x1b[2m";

// ── Token counter ────────────────────────────────────────────────────────────
// Coin-spin frames: gives the illusion of a rotating coin
const COIN_FRAMES = ["○", "◑", "●", "◐"];

export async function showTokenCount(messages, { spin = true } = {}) {
  const tok = (s) => Math.ceil((s || "").length / 4);
  let total = 0;
  for (const m of messages) total += tok(m.content) + 4;

  if (spin && messages.length > 0) {
    // Brief spin animation (5 frames × 65 ms ≈ 325 ms)
    for (let i = 0; i < 5; i++) {
      process.stdout.write(
        `  ${GOLD}${COIN_FRAMES[i % COIN_FRAMES.length]}${RESET}  ${DIM}${total.toLocaleString()} tokens${RESET}   \r`
      );
      await new Promise((r) => setTimeout(r, 65));
    }
  }
  // Settle on the full-coin with the final count
  process.stdout.write(
    `  ${GOLD}●${RESET}  ${DIM}${total.toLocaleString()} tokens${RESET}   \n`
  );
}

// ── Thinking animation ────────────────────────────────────────────────────────
let thinkingInterval = null;
let thinkingFrame = 0;

function printLlamaLines(lines) {
  for (const line of lines) {
    process.stdout.write(ORANGE + line + RESET + "\n");
  }
}

export function printBanner(version = "") {
  const ART = [
    "    __    __                     ______      ____   ________    ____",
    "   / /   / /___ _____ ___  ____ /_  __/___ _/ / /__/ ____/ /   /  _/",
    "  / /   / / __ `/ __ `__ \\/ __ `// / / __ `/ / //_/ /   / /    / /  ",
    " / /___/ / /_/ / / / / / / /_/ // / / /_/ / / ,< / /___/ /____/ /   ",
    "/_____/_/\\__,_/_/ /_/ /_/\\__,_//_/  \\__,_/_/_/|_|\\____/_____/___/   ",
  ];

  const termWidth = process.stdout.columns || 80;
  const artWidth = Math.max(...ART.map((l) => l.length));
  const padCount = Math.max(0, Math.floor((termWidth - artWidth) / 2));
  const pad = " ".repeat(padCount);

  const verStr = version ? `  ${DIM}v${version}${RESET}` : "";

  process.stdout.write("\n");
  for (const line of ART) {
    process.stdout.write(ORANGE + pad + line + RESET + "\n");
  }
  process.stdout.write(
    "\n" + pad + DIM + "Chat from the terminal" + RESET + verStr + "\n\n"
  );
}

export function printShortcutHint() {
  const hint = "Enter to send  \xB7  \u2191\u2193 prev inputs  \xB7  Esc cancel  \xB7  Ctrl+L clear  \xB7  Ctrl+C exit  \xB7  /help";
  const termWidth = process.stdout.columns || 80;
  const pad = " ".repeat(Math.max(0, Math.floor((termWidth - hint.length) / 2)));
  process.stdout.write(pad + DIM + hint + RESET + "\n");
}

export function printLlama() {
  process.stdout.write("\n");
  printLlamaLines(LLAMA_LINES);
  process.stdout.write("\n");
}

// Each frame adds one letter of "Thinking", then one asterisk at a time (6 total)
const THINKING_FRAMES = (() => {
  const word = "Thinking";
  const frames = [];
  for (let i = 1; i <= word.length; i++) frames.push(word.slice(0, i));
  for (let i = 1; i <= 6; i++) frames.push(word + " " + "*".repeat(i));
  return frames;
})();

export function startThinking() {
  thinkingFrame = 0;

  process.stdout.write("\n");
  process.stdout.write(ORANGE + THINKING_FRAMES[0] + RESET + DIM + "  Esc to cancel" + RESET + "\n");

  thinkingInterval = setInterval(() => {
    thinkingFrame = (thinkingFrame + 1) % THINKING_FRAMES.length;
    process.stdout.write("\x1b[1A");
    process.stdout.write("\x1b[2K");
    process.stdout.write(ORANGE + THINKING_FRAMES[thinkingFrame] + RESET + DIM + "  Esc to cancel" + RESET + "\n");
  }, 80);
}

export function stopThinking() {
  if (thinkingInterval) {
    clearInterval(thinkingInterval);
    thinkingInterval = null;

    // Clear star line + the leading blank line (2 lines total)
    process.stdout.write("\x1b[2A");
    process.stdout.write("\x1b[2K\n");
    process.stdout.write("\x1b[2K");
    process.stdout.write("\x1b[1A");
  }
}
