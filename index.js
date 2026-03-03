#!/usr/bin/env node
// Suppress Node.js experimental feature warnings (built-in fetch on Node 18)
process.removeAllListeners("warning");

import { createInterface } from "readline";
import { loadConfig, saveConfig, isFirstRun, pinRequired, verifyPin, needsPinMigration, hashPin } from "./src/config.js";
import { runOnboarding } from "./src/onboarding.js";
import { runChat } from "./src/chat.js";
import { sendMessage } from "./src/api.js";
import { runInstall, runUninstall, ensureLlamaCmd } from "./src/install.js";
import { fetchLatestRelease } from "./src/updater.js";

const VERSION = "0.4.0";

const RED = "\x1b[31m";
const ORANGE = "\x1b[38;5;208m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

// ---------------------------------------------------------------------------
// CLI argument parser
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    version: false,
    help: false,
    install: false,
    uninstall: false,
    noBanner: false,
    noHistory: false,
    model: null,
    wordDelay: null,
    message: null,   // one-shot message
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--version": case "-v":
        opts.version = true; break;
      case "--help": case "-h":
        opts.help = true; break;
      case "--install":
        opts.install = true; break;
      case "--uninstall":
        opts.uninstall = true; break;
      case "--no-banner":
        opts.noBanner = true; break;
      case "--no-history":
        opts.noHistory = true; break;
      case "--model": case "-m":
        opts.model = argv[++i] ?? null; break;
      case "--word-delay":
        opts.wordDelay = parseInt(argv[++i] ?? "20", 10); break;
      case "--message": case "-M":
        opts.message = argv[++i] ?? null; break;
      default:
        // Positional arg = one-shot message (first non-flag only)
        if (!arg.startsWith("-") && opts.message === null) {
          opts.message = arg;
        }
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
${ORANGE}${BOLD}LlamaTalkCLI${RESET} v${VERSION}  —  Chat with local and cloud AI from the terminal

${BOLD}Usage${RESET}
  llamatalkcli [options] [message]

${BOLD}Options${RESET}
  ${ORANGE}-v, --version${RESET}             Print version and exit
  ${ORANGE}-h, --help${RESET}                Print this help and exit
  ${ORANGE}-m, --model <name>${RESET}        Use a specific model for this session
  ${ORANGE}-M, --message <text>${RESET}      Send a one-shot message and exit (non-interactive)
  ${ORANGE}    --word-delay <ms>${RESET}     Override word-by-word delay (0–500)
  ${ORANGE}    --no-history${RESET}          Don't load or save conversation history
  ${ORANGE}    --no-banner${RESET}           Skip the llama banner
  ${ORANGE}    --install${RESET}             Add 'llama' shorthand and shell integration
  ${ORANGE}    --uninstall${RESET}           Remove shell integration added by --install

${BOLD}Examples${RESET}
  llamatalkcli                         Start interactive chat
  llamatalkcli -m llama3.2             Chat using a specific model
  llamatalkcli "What is 2+2?"          One-shot question, print answer, exit
  llamatalkcli -m gpt-4o "Explain..."  One-shot with a cloud model
  llamatalkcli --no-history            Chat without saving history
  llamatalkcli --word-delay 0          Instant response (no word delay)

${BOLD}Slash commands (interactive mode)${RESET}
  /help       Full command reference
  /models     List available models
  /settings   Show current config
  /clear      Clear conversation history
  /quit       Exit
`);
}

async function askMasked(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    let input = "";

    const onData = (char) => {
      const c = char.toString();
      if (c === "\r" || c === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
      } else if (c === "\x7f" || c === "\b") {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else if (c === "\x03") {
        process.exit(0);
      } else {
        input += c;
        process.stdout.write("*");
      }
    };

    try {
      process.stdin.setRawMode(true);
    } catch {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(prompt, (ans) => { rl.close(); resolve(ans); });
      return;
    }
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

// ---------------------------------------------------------------------------
// One-shot mode: send a single message, print the response, and exit
// ---------------------------------------------------------------------------
async function runOneShot(message, config) {
  const model = config.selectedModel;
  if (!model) {
    console.error(RED + "Error: no model selected. Run interactively first to complete setup." + RESET);
    process.exit(1);
  }

  const systemPrompt =
    config.modelPrompts?.[model] || config.modelPrompts?._default || "";
  const messages = [{ role: "user", content: message }];

  try {
    const response = await sendMessage(messages, config, systemPrompt);
    console.log(response);
  } catch (err) {
    console.error(RED + "Error: " + err.message + RESET);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// PIN authentication
// ---------------------------------------------------------------------------
async function authenticate(config) {
  if (!pinRequired(config)) return;

  console.log(ORANGE + "\nLlamaTalkCLI" + DIM + `  v${VERSION}` + RESET);

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    const pin = await askMasked(BOLD + "Enter PIN: " + RESET);
    if (verifyPin(pin, config.pinHash)) {
      if (needsPinMigration(config.pinHash)) {
        config.pinHash = hashPin(pin);
      }
      config.lastUnlockTime = new Date().toISOString();
      saveConfig(config);
      return;
    }
    attempts++;
    if (attempts < maxAttempts) {
      console.log(RED + `  Incorrect PIN. ${maxAttempts - attempts} attempt(s) remaining.` + RESET);
    }
  }

  console.log(RED + "  Too many incorrect attempts. Exiting." + RESET);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  ensureLlamaCmd(); // auto-write llama.cmd next to EXE on every startup

  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    console.log(`v${VERSION}`);
    process.exit(0);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.install) {
    runInstall();
    process.exit(0);
  }

  if (args.uninstall) {
    runUninstall();
    process.exit(0);
  }

  const config = loadConfig();

  // Apply CLI overrides
  if (args.model) config.selectedModel = args.model;
  if (args.wordDelay !== null && !isNaN(args.wordDelay)) config.wordDelay = args.wordDelay;

  // One-shot mode (non-interactive) — skip onboarding, PIN, banner, update check
  if (args.message) {
    if (isFirstRun(config)) {
      console.error(RED + "Error: run 'llamatalkcli' interactively first to complete setup." + RESET);
      process.exit(1);
    }
    await authenticate(config);
    await runOneShot(args.message, config);
    process.exit(0);
  }

  // Fire remote update check in the background early — result is usually ready
  // by the time auth/onboarding completes (~5–10 s window).
  const remoteCheckPromise = fetchLatestRelease().catch(() => null);

  // Interactive mode
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  rl.on("close", () => process.exit(0));

  if (isFirstRun(config)) {
    await runOnboarding(rl, config);
    saveConfig(config);
    await new Promise((r) => setTimeout(r, 500));
    await runChat(rl, config, { version: VERSION, noHistory: args.noHistory, noBanner: args.noBanner });
    return;
  }

  await authenticate(config);

  // Collect remote update result (give it up to 3 s if not yet done)
  const remoteUpdate = await Promise.race([
    remoteCheckPromise,
    new Promise((r) => setTimeout(() => r(null), 3000)),
  ]);

  await runChat(rl, config, {
    version: VERSION,
    noHistory: args.noHistory,
    noBanner: args.noBanner,
    remoteUpdate,
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
