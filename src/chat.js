import { sendMessage, streamMessage } from "./api.js";
import { startThinking, stopThinking, printBanner, showTokenCount, printShortcutHint } from "./llama.js";
import { handleCommand } from "./commands.js";
import { saveConfig, saveHistory, loadHistory } from "./config.js";
import { parseSemver, semverGt } from "./updater.js";

const ORANGE = "\x1b[38;5;208m";
const DARK_YELLOW = "\x1b[38;5;136m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

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

export async function runChat(rl, config, encKeyIn, opts = {}) {
  let encKey = encKeyIn;
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

  const messages = noHistory ? [] : loadHistory(encKey);
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
    saveHistory([], encKey);   // clear history so next run starts a new session
    saveConfig(config);
    process.stdout.write("\x1b[2J\x1b[H"); // clear screen
    console.log(ORANGE + "Session ended. See you next time.\n" + RESET);
    process.exit(0);
  });

  let lastUsage = null;

  while (true) {
    // Show token count + shortcut hint anchored to the input area.
    // Track how many lines we print so we can erase them after the user submits,
    // keeping the scroll history clean.
    let prePromptLines = 0;
    if (messages.length > 0) {
      await showTokenCount(messages, { spin: false, lastUsage });
      prePromptLines++;
    }
    printShortcutHint();
    prePromptLines++;

    const prompt = buildPrompt(config);

    // Listen for terminal resize — redraw banner + hint when it fires
    let resizeHandler = null;
    if (process.stdout.isTTY) {
      resizeHandler = () => {
        process.stdout.write("\x1b[2J\x1b[H"); // clear screen
        printBanner(version);
        if (messages.length > 0) {
          let total;
          if (lastUsage) {
            total = lastUsage.promptTokens + lastUsage.outputTokens;
          } else {
            const tok = (s) => Math.ceil((s || "").length / 4);
            total = 0;
            for (const m of messages) total += tok(m.content) + 4;
          }
          process.stdout.write(`  \x1b[38;5;220m●\x1b[0m  \x1b[2m${total.toLocaleString()} tokens\x1b[0m   \n`);
        }
        printShortcutHint();
        rl.setPrompt(prompt);
        rl.prompt(true); // redraw prompt
      };
      process.stdout.on("resize", resizeHandler);
    }

    let line;
    try {
      const timeoutMs = (config.inactivityTimeout ?? 30) * 60 * 1000;
      const userInput = new Promise((resolve) => rl.question(prompt, resolve));

      if (timeoutMs > 0) {
        let timer;
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("__INACTIVITY__")), timeoutMs);
        });
        try {
          line = await Promise.race([userInput, timeout]);
          clearTimeout(timer);
        } catch (e) {
          if (resizeHandler) process.stdout.removeListener("resize", resizeHandler);
          if (e.message === "__INACTIVITY__") {
            if (!noHistory) saveHistory(messages, encKey);
            rl.close();
            return { timedOut: true };
          }
          throw e;
        }
      } else {
        line = await userInput;
      }
    } catch {
      if (resizeHandler) process.stdout.removeListener("resize", resizeHandler);
      // readline closed
      break;
    }

    if (resizeHandler) process.stdout.removeListener("resize", resizeHandler);

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
      const result = await handleCommand(trimmed, config, rl, messages, version, encKey);
      if (result?.encKey !== undefined) encKey = result.encKey;
      if (!noHistory) saveHistory(messages, encKey);
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
    let firstToken = true;
    let tokenQueue = [];
    let drainTimer = null;
    const wdMs = config.wordDelay || 0;
    let streamTokenCount = 0;
    const streamStartMs = Date.now();

    let result;
    try {
      result = await streamMessage(messages, config, systemPrompt, (token) => {
        streamTokenCount++;
        if (firstToken) {
          firstToken = false;
          stopThinking();
          process.stdout.write(`\n${ORANGE}${BOLD}${getModelLabel(config)}${RESET}\n`);
        }
        response += token;
        if (wdMs > 0) {
          tokenQueue.push(token);
          if (!drainTimer) {
            drainTimer = setInterval(() => {
              if (tokenQueue.length > 0) {
                process.stdout.write(tokenQueue.shift());
              } else {
                clearInterval(drainTimer);
                drainTimer = null;
              }
            }, wdMs);
          }
        } else {
          process.stdout.write(token);
        }
      }, abortController.signal);
    } catch (err) {
      if (firstToken) stopThinking();
      if (drainTimer) clearInterval(drainTimer);
      stopEscWatch();
      if (cancelled) {
        // Flush any remaining queued tokens before showing cancelled
        while (tokenQueue.length > 0) process.stdout.write(tokenQueue.shift());
        if (!firstToken) process.stdout.write("\n");
        console.log(DIM + "  Cancelled." + RESET);
        // Keep partial response if we got tokens
        if (response) {
          messages.push({ role: "assistant", content: response });
        } else {
          messages.pop();
        }
      } else {
        if (!firstToken) process.stdout.write("\n");
        console.log(RED + `  Error: ${err.message}` + RESET);
        messages.pop();
      }
      if (!noHistory) saveHistory(messages, encKey);
      continue;
    }

    // Flush remaining queued tokens
    if (drainTimer) clearInterval(drainTimer);
    while (tokenQueue.length > 0) process.stdout.write(tokenQueue.shift());

    // If no tokens arrived (empty response), still print the label
    if (firstToken) {
      stopThinking();
      process.stdout.write(`\n${ORANGE}${BOLD}${getModelLabel(config)}${RESET}\n`);
    }

    process.stdout.write("\n");

    // Print TK/S summary line
    const elapsedMs = Date.now() - streamStartMs;
    const usage = result?.usage;
    const outputTokens = usage?.outputTokens || streamTokenCount;
    if (outputTokens > 0 && elapsedMs > 0) {
      let tks;
      if (result?.provider === "ollama" && usage?.evalDurationNs && usage.evalDurationNs > 0) {
        tks = (usage.outputTokens / (usage.evalDurationNs / 1e9)).toFixed(1);
      } else {
        tks = (outputTokens / (elapsedMs / 1000)).toFixed(1);
      }
      process.stdout.write(`  ${DIM}${DARK_YELLOW}●${RESET}  ${DIM}${outputTokens.toLocaleString()} tokens · ${tks} tk/s${RESET}\n`);
    }

    // Store usage for showTokenCount
    if (usage) {
      lastUsage = { promptTokens: usage.promptTokens || 0, outputTokens: usage.outputTokens || 0 };
    }

    messages.push({ role: "assistant", content: response });
    if (!noHistory) saveHistory(messages, encKey);

    stopEscWatch();
    console.log("");
  }

  if (!noHistory) saveHistory([], encKey); // clear history — next run starts a new session
  saveConfig(config);
  return {};
}
