import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { createHash, timingSafeEqual, pbkdf2Sync, randomBytes } from "crypto";
import { homedir } from "os";

const DEFAULTS = {
  profileName: "",
  pinHash: null,
  pinFrequency: "always",
  lastUnlockTime: null,
  ollamaUrl: "http://localhost:11434",
  selectedModel: "",
  modelNickname: {},
  modelPrompts: {},
  wordDelay: 20,
  temperature: 0.7,
  hiddenModels: [],
  apiKey_anthropic: "",
  apiKey_google: "",
  apiKey_openai: "",
  enabledProviders: { anthropic: false, google: false, openai: false },
  onboardingDone: false,
};

export function getConfigPath() {
  const appData = process.env.APPDATA;
  if (appData) {
    return join(appData, "LlamaTalkCLI", "config.json");
  }
  return join(homedir(), ".llamatalkcli", "config.json");
}

export function getHistoryPath() {
  const appData = process.env.APPDATA;
  if (appData) {
    return join(appData, "LlamaTalkCLI", "history.json");
  }
  return join(homedir(), ".llamatalkcli", "history.json");
}

export function loadConfig() {
  const configPath = getConfigPath();
  const dir = dirname(configPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(DEFAULTS, null, 2), "utf8");
    return { ...DEFAULTS };
  }

  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return deepMerge({ ...DEFAULTS }, parsed);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(config) {
  const configPath = getConfigPath();
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

export function isFirstRun(config) {
  return !config.onboardingDone;
}

function legacyHashPin(pin) {
  return createHash("sha256").update("llamatalkcli-pin-salt" + pin).digest("hex");
}

export function hashPin(pin) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(pin, salt, 100000, 32, "sha256");
  return `pbkdf2v1:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function needsPinMigration(hash) {
  return !!hash && !hash.startsWith("pbkdf2v1:");
}

export function verifyPin(pin, hash) {
  if (!hash) return false;
  if (hash.startsWith("pbkdf2v1:")) {
    const parts = hash.split(":");
    if (parts.length !== 3) return false;
    const salt = Buffer.from(parts[1], "hex");
    const stored = Buffer.from(parts[2], "hex");
    const computed = pbkdf2Sync(pin, salt, 100000, 32, "sha256");
    if (computed.length !== stored.length) return false;
    return timingSafeEqual(computed, stored);
  }
  // Legacy SHA-256 — auto-migrated to PBKDF2 on next successful unlock
  const computed = Buffer.from(legacyHashPin(pin), "hex");
  const stored = Buffer.from(hash, "hex");
  if (computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
}

export function pinRequired(config) {
  if (!config.pinHash) return false;
  if (config.pinFrequency === "never") return false;
  if (config.pinFrequency === "always") return true;
  if (config.pinFrequency === "30days") {
    if (!config.lastUnlockTime) return true;
    const last = new Date(config.lastUnlockTime).getTime();
    const now = Date.now();
    return now - last > 30 * 24 * 60 * 60 * 1000;
  }
  return true;
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      typeof target[key] === "object" &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      out[key] = deepMerge(target[key], source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}
