import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { sendMessage } from "./api.js";
import { startThinking, stopThinking, printBanner, showTokenCount, printShortcutHint } from "./llama.js";
import { handleCommand } from "./commands.js";
import { saveConfig, getHistoryPath } from "./config.js";
import { parseSemver, semverGt } from "./updater.js";

const ORANGE = "\x1b[38;5;208m";
const DARK_YELLOW = "\x1b[38;5;136m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function loadHistory() {
  const path = getHistoryPath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

function saveHistory(messages) {
  const path = getHistoryPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(messages, null, 2), "utf8");
}

function getModelPrompt(config) {
  const model = config.selectedModel;
  return config.modelPrompts?.[model] || config.modelPrompts?._default || "";
}

function getModelLabel(config) {
  const model = config.selectedModel || "no model";
  return config.modelNickname?.[model] || model;
}

function buildPrompt(config) {
  const label = getModelLabel(config);
  const name = config.profileName || "You";
  return `${DARK_YELLOW}${name}${RESET} ${DIM}[${label}]${RESET} ${BOLD}>${RESET} `;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Registers a raw-stdin listener for Esc (0x1b alone) during generation.
// readline is already in raw/terminal mode, so we piggyback on the existing stream.
// Returns a cleanup function to remove the listener.
function startEscWatch(onCancel) {
  let stopped = false;
  let fired = false;

  const onData = (chunk) => {
    if (stopped || fired) return;
    // Esc alone = single byte 0x1b; arrow keys / F-keys start with 0x1b + more bytes
    if (chunk[0] === 0x1b && chunk.length === 1) {
      fired = true;
      onCancel();
    }
  };

  try { process.stdin.setRawMode(true); } catch { /* non-TTY stdin — no raw mode */ }
  process.stdin.resume();
  process.stdin.on("data", onData);

  return () => {
    stopped = true;
    process.stdin.removeListener("data", onData);
  };
}

async function printWordByWord(text, wordDelay, signal = null) {
  if (!wordDelay || wordDelay === 0) {
    process.stdout.write(text + "\n");
    return;
  }
  const words = text.split(" ");
  for (let i = 0; i < words.length; i++) {
    if (signal?.aborted) break;
    process.stdout.write(words[i] + (i < words.length - 1 ? " " : ""));
    if (wordDelay > 0) await delay(wordDelay);
  }
  process.stdout.write("\n");
}

export async function runChat(rl, config, opts = {}) {
  const { noBanner = false, noHistory = false, version = "", remoteUpdate = null } = opts;

  if (!noBanner) printBanner(version);

  // Show a dim update hint if GitHub has a newer version
  if (remoteUpdate && version) {
    const current = parseSemver(version);
    const remote  = parseSemver(remoteUpdate.version);
    if (current && remote && semverGt(remote, current)) {
      console.log(DIM + `  v${remoteUpdate.version} available — /update to install` + RESET + "\n");
    }
  }

  if (config.profileName) {
    console.log(DIM + `  Welcome back, ${config.profileName}.` + RESET);
  }

  const messages = noHistory ? [] : loadHistory();
  if (!noHistory && messages.length > 0) {
    console.log(DIM + `  Resumed conversation (${messages.length} message(s)). /clear to start fresh.\n` + RESET);
  } else {
    console.log("");
  }

  if (!config.selectedModel) {
    console.log(`  ${ORANGE}No model selected.${RESET} Use ${BOLD}/models${RESET} then ${BOLD}/model <name>${RESET} to get started.\n`);
  }

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    saveHistory([]);   // clear history so next run starts a new session
    saveConfig(config);
    process.stdout.write("\x1b[2J\x1b[H"); // clear screen
    console.log(ORANGE + "Session ended. See you next time.\n" + RESET);
    process.exit(0);
  });

  while (true) {
    // Show token count + shortcut hint anchored to the input area.
    // Track how many lines we print so we can erase them after the user submits,
    // keeping the scroll history clean.
    let prePromptLines = 0;
    if (messages.length > 0) {
      await showTokenCount(messages, { spin: false });
      prePromptLines++;
    }
    printShortcutHint();
    prePromptLines++;

    const prompt = buildPrompt(config);
    let line;
    try {
      line = await new Promise((resolve) => {
        rl.question(prompt, resolve);
      });
    } catch {
      // readline closed
      break;
    }

    if (line === null || line === undefined) break;

    // Erase the pre-prompt lines (token count + hint) from scroll history.
    // After readline resolves, cursor is on the blank line below the input line.
    // Step up past the input line, erase each pre-prompt line, then step back down.
    process.stdout.write("\x1b[1A"); // up to input line
    for (let i = 0; i < prePromptLines; i++) {
      process.stdout.write("\x1b[1A\x1b[2K"); // up + erase
    }
    process.stdout.write("\x1b[" + (prePromptLines + 1) + "B"); // back down to below input

    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("/")) {
      await handleCommand(trimmed, config, rl, messages, version);
      if (!noHistory) saveHistory(messages);
      continue;
    }

    if (!config.selectedModel) {
      console.log(RED + "  No model selected. Use /model <name> or /models to see options." + RESET);
      continue;
    }

    messages.push({ role: "user", content: trimmed });

    const systemPrompt = getModelPrompt(config);
    const abortController = new AbortController();
    let cancelled = false;
    const stopEscWatch = startEscWatch(() => {
      cancelled = true;
      abortController.abort();
    });

    startThinking();

    let response = "";
    try {
      response = await sendMessage(messages, config, systemPrompt, abortController.signal);
      stopThinking();
    } catch (err) {
      stopThinking();
      stopEscWatch();
      if (cancelled) {
        console.log(DIM + "\n  Cancelled." + RESET);
      } else {
        console.log(RED + `  Error: ${err.message}` + RESET);
      }
      messages.pop();
      if (!noHistory) saveHistory(messages);
      continue;
    }

    messages.push({ role: "assistant", content: response });
    if (!noHistory) saveHistory(messages);

    console.log(`\n${ORANGE}${BOLD}${getModelLabel(config)}${RESET}`);
    await printWordByWord(response, config.wordDelay, abortController.signal);
    stopEscWatch();
    console.log("");
  }

  if (!noHistory) saveHistory([]); // clear history — next run starts a new session
  saveConfig(config);
}
