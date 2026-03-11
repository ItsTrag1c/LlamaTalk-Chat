import { createInterface } from "readline";
import { hashPin, generateEncKeySalt, deriveEncKey } from "./config.js";
import { getOllamaModels, detectBackend, getOpenAICompatModels, CLOUD_MODELS } from "./api.js";
import { printBanner } from "./llama.js";

const ORANGE = "\x1b[38;5;208m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
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
      // setRawMode not available (e.g. piped input), fallback
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(prompt, (ans) => {
        rl.close();
        resolve(ans);
      });
      return;
    }
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

export async function runOnboarding(rl, config) {
  printBanner();

  console.log(ORANGE + BOLD + "Welcome to ClankCLI!" + RESET);
  console.log(DIM + "Let's get you set up. This only takes a moment.\n" + RESET);

  // Step 1: Name
  const name = await ask(rl, BOLD + "What's your name? " + RESET);
  config.profileName = name.trim() || "User";
  console.log(GREEN + `  Nice to meet you, ${config.profileName}!` + RESET + "\n");

  // Step 2: PIN
  let encKey = null;
  const wantPin = await ask(rl, BOLD + "Set a PIN to protect your config? (y/n): " + RESET);
  if (wantPin.trim().toLowerCase() === "y") {
    let pinOk = false;
    while (!pinOk) {
      const pin1 = await askMasked(BOLD + "  Enter PIN: " + RESET);
      const pin2 = await askMasked(BOLD + "  Confirm PIN: " + RESET);
      if (pin1.length < 4) {
        console.log(RED + "  PIN must be at least 4 characters." + RESET);
      } else if (pin1 !== pin2) {
        console.log(RED + "  PINs don't match, try again." + RESET);
      } else {
        config.pinHash = hashPin(pin1);
        config.encKeySalt = generateEncKeySalt();
        encKey = deriveEncKey(pin1, config.encKeySalt);
        pinOk = true;
        console.log(GREEN + "  PIN set!" + RESET + "\n");
      }
    }
  } else {
    console.log(DIM + "  Skipped — you can set a PIN later with /set pin\n" + RESET);
  }

  // Step 3: Local server URL
  const urlInput = await ask(
    rl,
    BOLD + `Local server URL [${config.ollamaUrl}]: ` + RESET
  );
  if (urlInput.trim()) {
    config.ollamaUrl = urlInput.trim().replace(/\/$/, "");
  }

  // Step 4: Test server connection
  process.stdout.write(DIM + "  Testing server connection..." + RESET);
  let ollamaModels = [];
  try {
    const bt = await detectBackend(config.ollamaUrl);
    if (bt === "openai-compatible") {
      ollamaModels = await getOpenAICompatModels(config.ollamaUrl);
    } else {
      ollamaModels = await getOllamaModels(config.ollamaUrl);
    }
    if (bt !== "unknown") config.backendType = bt;
    process.stdout.write("\r" + GREEN + "  Server connected! " + ollamaModels.length + " model(s) found." + RESET + "\n\n");
  } catch (err) {
    process.stdout.write("\r" + YELLOW + "  Could not connect to server: " + err.message + RESET + "\n");
    console.log(DIM + "  You can update the URL later with /set server-url <url>\n" + RESET);
  }

  // Step 5: Cloud API keys
  const wantCloud = await ask(rl, BOLD + "Add cloud API keys? (y/n): " + RESET);
  if (wantCloud.trim().toLowerCase() === "y") {
    console.log(DIM + "  Press Enter to skip a provider.\n" + RESET);

    const anthropicKey = await ask(rl, "  Anthropic API key: ");
    if (anthropicKey.trim()) {
      config.apiKey_anthropic = anthropicKey.trim();
      config.enabledProviders.anthropic = true;
      console.log(GREEN + "  Anthropic enabled." + RESET);
    }

    const googleKey = await ask(rl, "  Google API key: ");
    if (googleKey.trim()) {
      config.apiKey_google = googleKey.trim();
      config.enabledProviders.google = true;
      console.log(GREEN + "  Google enabled." + RESET);
    }

    const openaiKey = await ask(rl, "  OpenAI API key: ");
    if (openaiKey.trim()) {
      config.apiKey_openai = openaiKey.trim();
      config.enabledProviders.openai = true;
      console.log(GREEN + "  OpenAI enabled." + RESET);
    }

    const opencodeKey = await ask(rl, "  OpenCode API key: ");
    if (opencodeKey.trim()) {
      config.apiKey_opencode = opencodeKey.trim();
      config.enabledProviders.opencode = true;
      console.log(GREEN + "  OpenCode enabled." + RESET);
    }

    console.log("");
  } else {
    console.log(DIM + "  Skipped — add keys later with /set api-key <provider> <key>\n" + RESET);
  }

  // Step 6: Select default model
  const allModels = buildModelList(ollamaModels, config);

  if (allModels.length === 0) {
    console.log(YELLOW + "  No models available. Set a model later with /model <name>" + RESET + "\n");
  } else {
    console.log(BOLD + "Available models:" + RESET);
    allModels.forEach((m, i) => {
      console.log(`  ${ORANGE}${i + 1}.${RESET} ${m}`);
    });
    console.log("");

    let selectedIdx = -1;
    while (selectedIdx < 0) {
      const choice = await ask(rl, BOLD + "Select default model (number): " + RESET);
      const n = parseInt(choice.trim(), 10);
      if (n >= 1 && n <= allModels.length) {
        selectedIdx = n - 1;
      } else {
        console.log(RED + "  Invalid choice." + RESET);
      }
    }
    config.selectedModel = allModels[selectedIdx];
    console.log(GREEN + `\n  Default model set to: ${config.selectedModel}` + RESET + "\n");
  }

  // Done
  config.onboardingDone = true;
  console.log(ORANGE + BOLD + "All set! Starting ClankCLI...\n" + RESET);
  return encKey;
}

function buildModelList(ollamaModels, config) {
  const models = [...ollamaModels.filter((m) => !config.hiddenModels.includes(m))];
  for (const [provider, list] of Object.entries(CLOUD_MODELS)) {
    if (config.enabledProviders[provider]) {
      models.push(...list);
    }
  }
  return models;
}
