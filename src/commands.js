import { writeFileSync, existsSync, readdirSync, unlinkSync } from "fs";
import { createInterface } from "readline";
import { join } from "path";
import { homedir, tmpdir } from "os";
import { spawn } from "child_process";
import { saveConfig, saveConfigWithKey, hashPin, verifyPin, getConfigPath, getHistoryPath, generateEncKeySalt, deriveEncKey, decryptApiKeys, saveHistory, loadHistory } from "./config.js";
import { getOllamaModels, CLOUD_MODELS } from "./api.js";
import { parseSemver, semverGt, fetchLatestRelease, downloadExe } from "./updater.js";

const ALLOWED_PROVIDERS = ["anthropic", "google", "openai"];
const PIN_FREQS = ["always", "30days", "never"];

function validateImportedConfig(imported) {
  if (typeof imported !== "object" || imported === null || Array.isArray(imported)) {
    return { ok: false, errors: ["Imported file is not a valid JSON object."] };
  }

  const errors = [];
  const clean = {};

  if ("profileName" in imported) {
    if (typeof imported.profileName !== "string" || imported.profileName.length > 100) {
      errors.push("profileName: must be a string (max 100 chars)");
    } else {
      clean.profileName = imported.profileName;
    }
  }

  if ("pinFrequency" in imported) {
    if (!PIN_FREQS.includes(imported.pinFrequency)) {
      errors.push(`pinFrequency: must be one of ${PIN_FREQS.join(", ")}`);
    } else {
      clean.pinFrequency = imported.pinFrequency;
    }
  }

  if ("ollamaUrl" in imported) {
    const url = imported.ollamaUrl;
    if (typeof url !== "string" || url.length > 500 || !/^https?:\/\/.+/.test(url)) {
      errors.push("ollamaUrl: must be a valid http/https URL (max 500 chars)");
    } else {
      clean.ollamaUrl = url.replace(/\/$/, "");
    }
  }

  if ("selectedModel" in imported) {
    if (typeof imported.selectedModel !== "string" || imported.selectedModel.length > 200) {
      errors.push("selectedModel: must be a string (max 200 chars)");
    } else {
      clean.selectedModel = imported.selectedModel;
    }
  }

  if ("wordDelay" in imported) {
    const v = imported.wordDelay;
    if (!Number.isInteger(v) || v < 0 || v > 500) {
      errors.push("wordDelay: must be an integer 0–500");
    } else {
      clean.wordDelay = v;
    }
  }

  if ("temperature" in imported) {
    const v = imported.temperature;
    if (typeof v !== "number" || isNaN(v) || v < 0 || v > 1) {
      errors.push("temperature: must be a number between 0.0 and 1.0");
    } else {
      clean.temperature = Math.round(v * 100) / 100;
    }
  }

  if ("hiddenModels" in imported) {
    const v = imported.hiddenModels;
    if (
      !Array.isArray(v) ||
      v.length > 500 ||
      v.some((x) => typeof x !== "string" || x.length > 200)
    ) {
      errors.push("hiddenModels: must be an array of strings (max 500 items, each max 200 chars)");
    } else {
      clean.hiddenModels = v;
    }
  }

  if ("modelNickname" in imported) {
    const v = imported.modelNickname;
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      errors.push("modelNickname: must be an object");
    } else {
      const keys = Object.keys(v);
      if (
        keys.length > 200 ||
        keys.some((k) => k.length > 200) ||
        Object.values(v).some((x) => typeof x !== "string" || x.length > 100)
      ) {
        errors.push("modelNickname: max 200 entries, values max 100 chars each");
      } else {
        clean.modelNickname = v;
      }
    }
  }

  if ("modelPrompts" in imported) {
    const v = imported.modelPrompts;
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      errors.push("modelPrompts: must be an object");
    } else {
      const keys = Object.keys(v);
      if (
        keys.length > 200 ||
        keys.some((k) => k.length > 200) ||
        Object.values(v).some((x) => typeof x !== "string" || x.length > 5000)
      ) {
        errors.push("modelPrompts: max 200 entries, values max 5000 chars each");
      } else {
        clean.modelPrompts = v;
      }
    }
  }

  if ("enabledProviders" in imported) {
    const v = imported.enabledProviders;
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      errors.push("enabledProviders: must be an object");
    } else {
      const keys = Object.keys(v);
      const unknown = keys.filter((k) => !ALLOWED_PROVIDERS.includes(k));
      if (unknown.length > 0) {
        errors.push(`enabledProviders: unknown keys: ${unknown.join(", ")}`);
      } else if (keys.some((k) => typeof v[k] !== "boolean")) {
        errors.push("enabledProviders: all values must be booleans");
      } else {
        clean.enabledProviders = { ...v };
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, clean };
}

const ORANGE = "\x1b[38;5;208m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function ask(rl, q) {
  return new Promise((r) => rl.question(q, r));
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
      const rl2 = createInterface({ input: process.stdin, output: process.stdout });
      rl2.question(prompt, (ans) => { rl2.close(); resolve(ans); });
      return;
    }
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

function maskKey(key) {
  if (!key) return DIM + "(not set)" + RESET;
  return key.slice(0, 4) + "..." + key.slice(-4);
}

function getModelPrompt(config, model) {
  const m = model || config.selectedModel;
  return config.modelPrompts[m] || config.modelPrompts._default || "";
}

function buildAllModels(ollamaModels, config) {
  const models = [...ollamaModels.filter((m) => !config.hiddenModels.includes(m))];
  for (const [provider, list] of Object.entries(CLOUD_MODELS)) {
    if (config.enabledProviders[provider]) models.push(...list);
  }
  return models;
}

export async function handleCommand(line, config, rl, messages, version = "", encKey = null) {
  const trimmed = line.trim();
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  // /help
  if (cmd === "/help") {
    console.log(`
${ORANGE}${BOLD}LlamaTalkCLI Commands${RESET}

${BOLD}Chat${RESET}
  ${ORANGE}/model${RESET}                         Show current model
  ${ORANGE}/model <name>${RESET}                  Switch to a model
  ${ORANGE}/models${RESET}                        List all available models
  ${ORANGE}/clear${RESET}                         Clear message history

${BOLD}Settings${RESET}
  ${ORANGE}/settings${RESET}                      Show current config
  ${ORANGE}/set ollama-url <url>${RESET}           Update Ollama server URL
  ${ORANGE}/set api-key <provider> <key>${RESET}  Set API key (anthropic/google/openai)
  ${ORANGE}/set provider enable|disable <p>${RESET} Toggle a cloud provider
  ${ORANGE}/set word-delay <ms>${RESET}           Set word-by-word delay (0–500ms)
  ${ORANGE}/set prompt [model]${RESET}            Edit system prompt for a model
  ${ORANGE}/set prompt clear [model]${RESET}      Clear system prompt for a model
  ${ORANGE}/set nick <name>${RESET}               Set nickname for current model
  ${ORANGE}/set pin${RESET}                       Change or set PIN
  ${ORANGE}/set pin-frequency <freq>${RESET}      Set PIN frequency (always/30days/never)
  ${ORANGE}/hide <model>${RESET}                  Hide a model from the list
  ${ORANGE}/unhide <model>${RESET}                Unhide a model
  ${ORANGE}/temp [0.0–1.0]${RESET}               Show or set temperature (0.0 = precise, 1.0 = creative)
  ${ORANGE}/speedup${RESET}                       Speed up word-by-word text display (−5 ms)
  ${ORANGE}/slowdown${RESET}                      Slow down word-by-word text display (+5 ms)

${BOLD}Data${RESET}
  ${ORANGE}/export [path]${RESET}                 Export config JSON to file
  ${ORANGE}/import <path>${RESET}                 Import config JSON from file

${BOLD}Other${RESET}
  ${ORANGE}/update${RESET}                        Check for and install a newer version
  ${ORANGE}/quit${RESET} or ${ORANGE}/exit${RESET}                 Exit LlamaTalkCLI
`);
    return { handled: true };
  }

  // /quit, /exit
  if (cmd === "/quit" || cmd === "/exit") {
    try { saveHistory([], encKey); } catch { /* ignore */ }
    process.stdout.write("\x1b[2J\x1b[H"); // clear screen
    console.log(ORANGE + "Session ended. See you next time.\n" + RESET);
    process.exit(0);
  }

  // /clear
  if (cmd === "/clear") {
    messages.length = 0;
    saveHistory([], encKey);
    console.log(GREEN + "  Conversation cleared." + RESET);
    return { handled: true };
  }

  // /model (no args = show current)
  if (cmd === "/model" && args.length === 0) {
    const nick = config.modelNickname?.[config.selectedModel];
    const display = nick ? `${config.selectedModel} (${ORANGE}${nick}${RESET})` : config.selectedModel;
    console.log(`  Current model: ${BOLD}${display}${RESET}`);
    return { handled: true };
  }

  // /model <name>
  if (cmd === "/model" && args.length > 0) {
    const newModel = args.join(" ");
    config.selectedModel = newModel;
    saveConfig(config);
    const nick = config.modelNickname?.[newModel];
    const label = nick ? `${newModel} (${nick})` : newModel;
    console.log(GREEN + `  Switched to: ${label}` + RESET);
    return { handled: true };
  }

  // /models
  if (cmd === "/models") {
    let ollamaModels = [];
    try {
      ollamaModels = await getOllamaModels(config.ollamaUrl);
    } catch {
      console.log(YELLOW + "  Could not reach Ollama." + RESET);
    }

    const all = buildAllModels(ollamaModels, config);
    if (all.length === 0) {
      console.log(YELLOW + "  No models available." + RESET);
    } else {
      console.log(`\n${BOLD}Available models:${RESET}`);
      for (const m of all) {
        const isCurrent = m === config.selectedModel;
        const nick = config.modelNickname?.[m];
        const suffix = nick ? ` ${DIM}(${nick})${RESET}` : "";
        const marker = isCurrent ? GREEN + " ◀ current" + RESET : "";
        console.log(`  ${ORANGE}•${RESET} ${m}${suffix}${marker}`);
      }
      console.log("");
    }
    return { handled: true };
  }

  // /settings
  if (cmd === "/settings") {
    const ep = config.enabledProviders;
    console.log(`
${ORANGE}${BOLD}Current Settings${RESET}
  Profile:        ${config.profileName || DIM + "(not set)" + RESET}
  PIN:            ${config.pinHash ? GREEN + "set" + RESET : DIM + "none" + RESET}
  PIN frequency:  ${config.pinFrequency}
  Model:          ${config.selectedModel || DIM + "(none)" + RESET}
  Ollama URL:     ${config.ollamaUrl}
  Word delay:     ${config.wordDelay}ms
  Hidden models:  ${config.hiddenModels.length > 0 ? config.hiddenModels.join(", ") : DIM + "none" + RESET}

${BOLD}Cloud Providers${RESET}
  Anthropic:  ${ep.anthropic ? GREEN + "enabled" + RESET : DIM + "disabled" + RESET}  key: ${maskKey(config.apiKey_anthropic)}
  Google:     ${ep.google ? GREEN + "enabled" + RESET : DIM + "disabled" + RESET}  key: ${maskKey(config.apiKey_google)}
  OpenAI:     ${ep.openai ? GREEN + "enabled" + RESET : DIM + "disabled" + RESET}  key: ${maskKey(config.apiKey_openai)}

${DIM}Config: ${getConfigPath()}${RESET}
`);
    return { handled: true };
  }

  // /set ollama-url <url>
  if (cmd === "/set" && args[0] === "ollama-url" && args[1]) {
    const newUrl = args[1].replace(/\/$/, "");
    process.stdout.write(DIM + "  Testing connection..." + RESET);
    try {
      await getOllamaModels(newUrl);
      config.ollamaUrl = newUrl;
      saveConfig(config);
      process.stdout.write("\r" + GREEN + "  Ollama URL updated and connection verified." + RESET + "\n");
    } catch (err) {
      process.stdout.write("\r" + YELLOW + `  Warning: could not connect to ${newUrl}: ${err.message}` + RESET + "\n");
      const proceed = await ask(rl, "  Save anyway? (y/n): ");
      if (proceed.trim().toLowerCase() === "y") {
        config.ollamaUrl = newUrl;
        saveConfig(config);
        console.log(GREEN + "  URL saved." + RESET);
      }
    }
    return { handled: true };
  }

  // /set api-key <provider> <key>
  if (cmd === "/set" && args[0] === "api-key" && args[1] && args[2]) {
    const provider = args[1].toLowerCase();
    const key = args[2];
    if (!["anthropic", "google", "openai"].includes(provider)) {
      console.log(RED + "  Unknown provider. Use: anthropic, google, openai" + RESET);
      return { handled: true };
    }
    config[`apiKey_${provider}`] = key;
    config.enabledProviders[provider] = true;
    saveConfigWithKey(config, encKey);
    console.log(GREEN + `  ${provider} API key saved and provider enabled.` + RESET);
    return { handled: true };
  }

  // /set provider enable|disable <provider>
  if (cmd === "/set" && args[0] === "provider" && args[1] && args[2]) {
    const action = args[1].toLowerCase();
    const provider = args[2].toLowerCase();
    if (!["enable", "disable"].includes(action)) {
      console.log(RED + "  Use: /set provider enable|disable <provider>" + RESET);
      return { handled: true };
    }
    if (!["anthropic", "google", "openai"].includes(provider)) {
      console.log(RED + "  Unknown provider. Use: anthropic, google, openai" + RESET);
      return { handled: true };
    }
    config.enabledProviders[provider] = action === "enable";
    saveConfig(config);
    console.log(GREEN + `  ${provider} ${action}d.` + RESET);
    return { handled: true };
  }

  // /set word-delay <ms>
  if (cmd === "/set" && args[0] === "word-delay" && args[1]) {
    const ms = parseInt(args[1], 10);
    if (isNaN(ms) || ms < 0 || ms > 500) {
      console.log(RED + "  Word delay must be 0–500ms." + RESET);
      return { handled: true };
    }
    config.wordDelay = ms;
    saveConfig(config);
    console.log(GREEN + `  Word delay set to ${ms}ms.` + RESET);
    return { handled: true };
  }

  // /set prompt clear [model]
  if (cmd === "/set" && args[0] === "prompt" && args[1] === "clear") {
    const model = args[2] || config.selectedModel;
    delete config.modelPrompts[model];
    saveConfig(config);
    console.log(GREEN + `  System prompt cleared for ${model}.` + RESET);
    return { handled: true };
  }

  // /set prompt [model] — inline editor
  if (cmd === "/set" && args[0] === "prompt") {
    const model = args[1] || config.selectedModel;
    const current = config.modelPrompts[model] || "";
    console.log(`\n${BOLD}Editing system prompt for: ${ORANGE}${model}${RESET}`);
    if (current) {
      console.log(DIM + `Current: ${current}` + RESET);
    }
    console.log(DIM + "(Enter new prompt, or press Enter to keep current, or type CLEAR to remove)" + RESET);
    const newPrompt = await ask(rl, "  Prompt: ");
    if (newPrompt.trim() === "CLEAR") {
      delete config.modelPrompts[model];
      saveConfig(config);
      console.log(GREEN + "  Prompt cleared." + RESET);
    } else if (newPrompt.trim()) {
      config.modelPrompts[model] = newPrompt.trim();
      saveConfig(config);
      console.log(GREEN + "  Prompt saved." + RESET);
    } else {
      console.log(DIM + "  No change." + RESET);
    }
    return { handled: true };
  }

  // /set nick <name>
  if (cmd === "/set" && args[0] === "nick" && args.length > 1) {
    const nick = args.slice(1).join(" ");
    if (!config.modelNickname) config.modelNickname = {};
    config.modelNickname[config.selectedModel] = nick;
    saveConfig(config);
    console.log(GREEN + `  Nickname set: ${config.selectedModel} → ${nick}` + RESET);
    return { handled: true };
  }

  // /set pin
  if (cmd === "/set" && args[0] === "pin" && args.length === 1) {
    // If existing PIN, verify it first
    if (config.pinHash) {
      const current = await askMasked("  Current PIN: ");
      if (!verifyPin(current, config.pinHash)) {
        console.log(RED + "  Incorrect PIN." + RESET);
        return { handled: true };
      }
    }
    let pinOk = false;
    let newEncKey = encKey;
    while (!pinOk) {
      const p1 = await askMasked("  New PIN (Enter to remove): ");
      if (p1 === "") {
        // PIN removed — decrypt everything back to plaintext
        if (encKey) {
          const decrypted = decryptApiKeys(config, encKey);
          config.apiKey_anthropic = decrypted.apiKey_anthropic;
          config.apiKey_google    = decrypted.apiKey_google;
          config.apiKey_openai    = decrypted.apiKey_openai;
          saveHistory(loadHistory(encKey), null);
        }
        config.pinHash = null;
        config.encKeySalt = null;
        saveConfig(config);
        newEncKey = null;
        console.log(GREEN + "  PIN removed." + RESET);
        pinOk = true;
      } else {
        const p2 = await askMasked("  Confirm PIN: ");
        if (p1 === p2) {
          config.pinHash = hashPin(p1);
          config.encKeySalt = generateEncKeySalt();
          newEncKey = deriveEncKey(p1, config.encKeySalt);
          // Re-encrypt API keys and history with new key
          saveConfigWithKey(config, newEncKey);
          saveHistory(loadHistory(encKey), newEncKey);
          console.log(GREEN + "  PIN updated." + RESET);
          pinOk = true;
        } else {
          console.log(RED + "  PINs don't match, try again." + RESET);
        }
      }
    }
    return { handled: true, encKey: newEncKey };
  }

  // /set pin-frequency <freq>
  if (cmd === "/set" && args[0] === "pin-frequency" && args[1]) {
    const freq = args[1].toLowerCase();
    if (!["always", "30days", "never"].includes(freq)) {
      console.log(RED + "  Use: always, 30days, never" + RESET);
      return { handled: true };
    }
    config.pinFrequency = freq;
    saveConfig(config);
    console.log(GREEN + `  PIN frequency set to: ${freq}` + RESET);
    return { handled: true };
  }

  // /hide <model>
  if (cmd === "/hide" && args.length > 0) {
    const model = args.join(" ");
    if (!config.hiddenModels.includes(model)) {
      config.hiddenModels.push(model);
      saveConfig(config);
      console.log(GREEN + `  ${model} hidden.` + RESET);
    } else {
      console.log(DIM + `  ${model} is already hidden.` + RESET);
    }
    return { handled: true };
  }

  // /unhide <model>
  if (cmd === "/unhide" && args.length > 0) {
    const model = args.join(" ");
    const idx = config.hiddenModels.indexOf(model);
    if (idx >= 0) {
      config.hiddenModels.splice(idx, 1);
      saveConfig(config);
      console.log(GREEN + `  ${model} unhidden.` + RESET);
    } else {
      console.log(DIM + `  ${model} was not hidden.` + RESET);
    }
    return { handled: true };
  }

  // /export [path]
  if (cmd === "/export") {
    const dest = args[0] || join(homedir(), "Desktop", "llamatalkcli-config.json");
    // Strip sensitive keys
    const exported = { ...config };
    delete exported.pinHash;
    delete exported.lastUnlockTime;
    delete exported.apiKey_anthropic;
    delete exported.apiKey_google;
    delete exported.apiKey_openai;
    try {
      writeFileSync(dest, JSON.stringify(exported, null, 2), "utf8");
      console.log(GREEN + `  Config exported to: ${dest}` + RESET);
    } catch (err) {
      console.log(RED + `  Export failed: ${err.message}` + RESET);
    }
    return { handled: true };
  }

  // /import <path>
  if (cmd === "/import" && args[0]) {
    const src = args[0];
    if (!existsSync(src)) {
      console.log(RED + `  File not found: ${src}` + RESET);
      return { handled: true };
    }
    try {
      const raw = readFileSync(src, "utf8");
      const imported = JSON.parse(raw);
      const result = validateImportedConfig(imported);
      if (!result.ok) {
        console.log(RED + "  Import rejected — invalid fields:" + RESET);
        for (const err of result.errors) {
          console.log(RED + `    • ${err}` + RESET);
        }
        return { handled: true };
      }
      Object.assign(config, result.clean);
      config.onboardingDone = true;
      saveConfig(config);
      console.log(GREEN + "  Config imported and saved." + RESET);
    } catch (err) {
      console.log(RED + `  Import failed: ${err.message}` + RESET);
    }
    return { handled: true };
  }

  // /speedup
  if (cmd === "/speedup") {
    config.wordDelay = Math.max(0, (config.wordDelay ?? 20) - 5);
    saveConfig(config);
    const label = config.wordDelay === 0 ? "instant (no delay)" : `${config.wordDelay}ms`;
    console.log(GREEN + `  Word delay: ${label}.` + RESET);
    return { handled: true };
  }

  // /slowdown
  if (cmd === "/slowdown") {
    config.wordDelay = Math.min(500, (config.wordDelay ?? 20) + 5);
    saveConfig(config);
    console.log(GREEN + `  Word delay: ${config.wordDelay}ms.` + RESET);
    return { handled: true };
  }

  // /temp [value]
  if (cmd === "/temp") {
    const current = config.temperature ?? 0.7;
    if (args.length === 0) {
      console.log(`  Temperature: ${BOLD}${current.toFixed(2)}${RESET} ${DIM}(0.0 = precise, 1.0 = creative)${RESET}`);
      return { handled: true };
    }
    const val = parseFloat(args[0]);
    if (isNaN(val) || val < 0 || val > 1) {
      console.log(RED + "  Temperature must be a number between 0.0 and 1.0." + RESET);
      return { handled: true };
    }
    config.temperature = Math.round(val * 100) / 100;
    saveConfig(config);
    console.log(GREEN + `  Temperature set to ${config.temperature.toFixed(2)}.` + RESET);
    return { handled: true };
  }

  // /update
  if (cmd === "/update") {
    if (!version) {
      console.log(YELLOW + "  Update check not available in dev mode." + RESET);
      return { handled: true };
    }
    const currentVer = parseSemver(version);
    if (!currentVer) {
      console.log(RED + "  Could not parse current version." + RESET);
      return { handled: true };
    }
    const isExe = !!process.pkg;
    const installDir = isExe ? dirname(process.execPath) : join(homedir(), "LlamaTalkCLI");

    // Step 1: Check local install dir for a pre-placed versioned EXE
    process.stdout.write(DIM + "  Checking for updates..." + RESET);
    let localBest = null;
    let localBestVer = null;
    try {
      const files = readdirSync(installDir);
      for (const file of files) {
        const match = file.match(/^LlamaTalkCLI_(\d+\.\d+\.\d+)\.exe$/);
        if (!match) continue;
        const ver = parseSemver(match[1]);
        if (!ver) continue;
        if (semverGt(ver, currentVer)) {
          if (!localBestVer || semverGt(ver, localBestVer)) {
            localBest = { file, ver: match[1], path: join(installDir, file) };
            localBestVer = ver;
          }
        }
      }
    } catch {
      // Local dir unreadable — fall through to remote check
    }

    if (localBest) {
      process.stdout.write("\r" + ORANGE + `  Update available: v${version} → v${localBest.ver}` + RESET + "          \n");
      const confirm = await ask(rl, `  Install v${localBest.ver} now? (y/n): `);
      if (confirm.trim().toLowerCase() !== "y") {
        console.log(DIM + "  Update cancelled." + RESET);
        return { handled: true };
      }
      const batPath = join(tmpdir(), "llamatalkcli-update.bat");
      const currentExe = process.execPath;
      const bat = [
        "@echo off",
        "ping -n 3 127.0.0.1 > nul",
        `copy /Y "${localBest.path}" "${currentExe}"`,
        `del /Q "${installDir}\\LlamaTalkCLI_*.exe" 2>nul`,
        `del "%~f0"`,
      ].join("\r\n");
      writeFileSync(batPath, bat, "utf8");
      console.log(ORANGE + `\n  Installing v${localBest.ver}... LlamaTalkCLI will close now.\n` + RESET);
      const child = spawn("cmd.exe", ["/c", batPath], { detached: true, stdio: "ignore" });
      child.unref();
      process.exit(0);
    }

    // Step 2: Check GitHub for a newer release
    process.stdout.write("\r" + DIM + "  Checking GitHub for updates..." + RESET + "          ");
    let release = null;
    try {
      release = await fetchLatestRelease();
    } catch {
      // Network error — silent
    }

    if (!release) {
      process.stdout.write("\r" + GREEN + `  LlamaTalkCLI is up to date (v${version}).` + RESET + "          \n");
      return { handled: true };
    }

    const remoteVer = parseSemver(release.version);
    if (!remoteVer || !semverGt(remoteVer, currentVer)) {
      process.stdout.write("\r" + GREEN + `  LlamaTalkCLI is up to date (v${version}).` + RESET + "          \n");
      return { handled: true };
    }

    process.stdout.write(
      "\r" + ORANGE + `  Update available: v${version} → v${release.version} (${release.sizeMB} MB)` + RESET + "          \n"
    );
    const confirm = await ask(rl, `  Download and install v${release.version} now? (y/n): `);
    if (confirm.trim().toLowerCase() !== "y") {
      console.log(DIM + "  Update cancelled." + RESET);
      return { handled: true };
    }

    const exeName = `LlamaTalkCLI_${release.version}.exe`;
    const destPath = join(installDir, exeName);
    console.log(ORANGE + `\n  Downloading LlamaTalkCLI v${release.version} (${release.sizeMB} MB)...` + RESET);

    let actualHash;
    try {
      actualHash = await downloadExe(release.exeUrl, destPath, release.sizeMB * 1024 * 1024);
    } catch (err) {
      console.log(RED + `  Download failed: ${err.message}` + RESET);
      return { handled: true };
    }

    // Verify checksum if available
    if (release.checksumUrl) {
      try {
        const csRes = await fetch(release.checksumUrl, { headers: { "User-Agent": "LlamaTalkCLI" } });
        if (csRes.ok) {
          const csText = await csRes.text();
          const line = csText.split("\n").find((l) => l.includes(exeName));
          const expectedHash = line?.split(/\s+/)[0];
          if (expectedHash && actualHash !== expectedHash) {
            unlinkSync(destPath);
            console.log(RED + "  Checksum mismatch — download may be corrupted. File removed." + RESET);
            return { handled: true };
          }
        }
      } catch {
        // Checksum fetch failed — proceed anyway (TLS already protects the channel)
      }
    }

    const batPath = join(tmpdir(), "llamatalkcli-update.bat");
    const currentExe = process.execPath;
    const bat = [
      "@echo off",
      "ping -n 3 127.0.0.1 > nul",
      `copy /Y "${destPath}" "${currentExe}"`,
      `del /Q "${installDir}\\LlamaTalkCLI_*.exe" 2>nul`,
      `del "%~f0"`,
    ].join("\r\n");
    writeFileSync(batPath, bat, "utf8");
    console.log(ORANGE + `\n  Installing v${release.version}... LlamaTalkCLI will close now.\n` + RESET);
    const child = spawn("cmd.exe", ["/c", batPath], { detached: true, stdio: "ignore" });
    child.unref();
    process.exit(0);
  }

  // Unknown command
  console.log(YELLOW + `  Unknown command: ${cmd}. Type /help for a list.` + RESET);
  return { handled: true };
}

