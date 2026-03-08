const ORANGE = "\x1b[38;5;208m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

// Braille-dot llama art — matches suite-wide emoji-based icon style
const LLAMA_LINES = [
  "    ⢀⣀⣤⣄        ",
  "   ⢀⡴⡃⢔⣮⠯⡄      ",
  "  ⢀⡔⡁⠞⣠⡞⣁⠌     ",
  " ⡴⠉⡔⠁⡔⢁⡜⠁      ",
  "⢀⡏⠁⠐⠁⣎⡡⡃       ",
  "⢀⡃⠀⠀⠀⠉⠉⠚⢯⡦⣆⣄⣀⡀",
  "⡏⠀⠀⠀⠄⣶⡄⠀⠀⠀⠀⠉⣳⣶⣒⡄",
  "⢠⠅⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠟⠛⠓⡇",
  "⠪⡡⠤⢤⣀⣀⣀⡀⡀⡀⠀⠀⣀⣀⣰⠇",
  "⢈⡅⠀⠀⠀⠈⠁⠉⠉⠛⠓⠚⠐⠓⠲⠞⠃",
  "⠈⠄⡔⠀⠀⡀⡀⠀⢠⠀⡄   ",
  " ⡃⣷⠇⢄⠀⢀⣀⠁⠘⢢⢣  ",
];

const GOLD  = "\x1b[38;5;220m";
const DIM   = "\x1b[2m";

// ── Token counter ────────────────────────────────────────────────────────────
// Coin-spin frames: gives the illusion of a rotating coin
const COIN_FRAMES = ["○", "◑", "●", "◐"];

export async function showTokenCount(messages, { spin = true, lastUsage } = {}) {
  let total;
  if (lastUsage) {
    total = (lastUsage.promptTokens || 0) + (lastUsage.outputTokens || 0);
  } else {
    const tok = (s) => Math.ceil((s || "").length / 4);
    total = 0;
    for (const m of messages) total += tok(m.content) + 4;
  }
  const label = lastUsage ? `${total.toLocaleString()} tokens` : `~${total.toLocaleString()} tokens`;

  if (spin && messages.length > 0) {
    // Brief spin animation (5 frames × 65 ms ≈ 325 ms)
    for (let i = 0; i < 5; i++) {
      process.stdout.write(
        `  ${GOLD}${COIN_FRAMES[i % COIN_FRAMES.length]}${RESET}  ${DIM}${label}${RESET}   \r`
      );
      await new Promise((r) => setTimeout(r, 65));
    }
  }
  // Settle on the full-coin with the final count
  process.stdout.write(
    `  ${GOLD}●${RESET}  ${DIM}${label}${RESET}   \n`
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

const ART_LARGE = [
  "    __    __                     ______      ____   ________    ____",
  "   / /   / /___ _____ ___  ____ /_  __/___ _/ / /__/ ____/ /   /  _/",
  "  / /   / / __ `/ __ `__ \\/ __ `// / / __ `/ / //_/ /   / /    / /  ",
  " / /___/ / /_/ / / / / / / /_/ // / / /_/ / / ,< / /___/ /____/ /   ",
  "/_____/_/\\__,_/_/ /_/ /_/\\__,_//_/  \\__,_/_/_/|_|\\____/_____/___/   ",
];

const ART_SMALL = [
  " _    _                 _____     _ _    ___ _ ___",
  "| |  | |               |_   _|   | | |  / __| |_ _|",
  "| |  | | __ _ _ __ ___   | | __ _| | |_| |  | || |",
  "| |__| |/ _` | '_ ` _ \\  | |/ _` | | / | |__| || |",
  "|____|_|\\__,_|_| |_| |_| |_|\\__,_|_|_\\_\\____|_|___|",
];

export function printBanner(version = "") {
  const termWidth = process.stdout.columns || 80;
  const ART = termWidth >= 70 ? ART_LARGE : ART_SMALL;
  const artWidth = Math.max(...ART.map((l) => l.length));
  const padCount = Math.max(0, Math.floor((termWidth - artWidth) / 2));
  const pad = " ".repeat(padCount);

  const verStr = version ? `  ${DIM}v${version}${RESET}` : "";
  const tagline = "Chat from the terminal";
  const tagPad = " ".repeat(Math.max(0, Math.floor((termWidth - tagline.length - (version ? version.length + 4 : 0)) / 2)));

  process.stdout.write("\n");
  for (const line of ART) {
    process.stdout.write(ORANGE + pad + line + RESET + "\n");
  }
  process.stdout.write(
    "\n" + tagPad + DIM + tagline + RESET + verStr + "\n\n"
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
