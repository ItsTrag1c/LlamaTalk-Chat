import { writeFileSync, readFileSync, existsSync, unlinkSync } from "fs";
import { execSync } from "child_process";
import { join, dirname } from "path";
import { homedir } from "os";

const ORANGE = "\x1b[38;5;208m";
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";

const PS_MARKER = "# ClankCLI";

function getInstallDir() {
  return process.pkg ? dirname(process.execPath) : join(homedir(), "ClankCLI");
}

function getPsProfilePath() {
  try {
    return execSync('powershell -NoProfile -Command "$PROFILE"', { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function removeFromPsProfile() {
  const profilePath = getPsProfilePath();
  if (!profilePath || !existsSync(profilePath)) return;

  const content = readFileSync(profilePath, "utf8");
  const lines = content.split("\n");
  const filtered = lines.filter((line) => {
    const t = line.trim();
    return (
      !t.startsWith(PS_MARKER) &&
      !t.startsWith("# LlamaTalkCLI") &&
      !t.includes("function llamatalkcli") &&
      !t.includes("function clankcli") &&
      !t.includes("LlamaTalkCLI.exe") &&
      !t.includes("ClankCLI.exe") &&
      !t.includes("Set-Alias -Name llama -Value llamatalkcli") &&
      !t.includes("Set-Alias llama llamatalkcli") &&
      !t.includes("Set-Alias -Name clank -Value clankcli") &&
      !t.includes("Set-Alias clank clankcli")
    );
  });

  if (filtered.length < lines.length) {
    writeFileSync(profilePath, filtered.join("\n"), "utf8");
    console.log(GREEN + `  Removed from PowerShell profile: ${profilePath}` + RESET);
  } else {
    console.log(DIM + "  No ClankCLI entries found in PowerShell profile." + RESET);
  }
}

function addToPath(installDir) {
  try {
    let currentPath = "";
    try {
      const result = execSync('reg query "HKCU\\Environment" /v Path', { encoding: "utf8" });
      const match = result.match(/REG_(?:EXPAND_)?SZ\s+(.+)/);
      currentPath = match ? match[1].trim() : "";
    } catch {
      // Path key may not exist yet
    }

    const dirs = currentPath.split(";").map((d) => d.trim()).filter(Boolean);
    if (dirs.some((d) => d.toLowerCase() === installDir.toLowerCase())) {
      console.log("  PATH already includes install directory.");
      return;
    }

    const newPath = [...dirs, installDir].join(";");
    execSync(
      `reg add "HKCU\\Environment" /v Path /t REG_EXPAND_SZ /d "${newPath}" /f`,
      { encoding: "utf8" }
    );
    console.log(GREEN + `  Added to PATH: ${installDir}` + RESET);
    console.log(DIM + "  (Restart terminal windows for PATH changes to take effect)" + RESET);
  } catch (err) {
    console.log(RED + `  Could not update PATH: ${err.message}` + RESET);
  }
}

function removeFromPath(installDir) {
  try {
    let currentPath = "";
    try {
      const result = execSync('reg query "HKCU\\Environment" /v Path', { encoding: "utf8" });
      const match = result.match(/REG_(?:EXPAND_)?SZ\s+(.+)/);
      currentPath = match ? match[1].trim() : "";
    } catch {
      return;
    }

    const dirs = currentPath.split(";").map((d) => d.trim()).filter(Boolean);
    const filtered = dirs.filter((d) => d.toLowerCase() !== installDir.toLowerCase());

    if (filtered.length < dirs.length) {
      const newPath = filtered.join(";");
      execSync(
        `reg add "HKCU\\Environment" /v Path /t REG_EXPAND_SZ /d "${newPath}" /f`,
        { encoding: "utf8" }
      );
      console.log(GREEN + `  Removed from PATH: ${installDir}` + RESET);
    } else {
      console.log(DIM + "  Install directory was not in PATH." + RESET);
    }
  } catch (err) {
    console.log(RED + `  Could not update PATH: ${err.message}` + RESET);
  }
}

// Returns the install directory written by the NSIS installer, or null if not installed.
function getNsisInstalledDir() {
  try {
    // Check new registry key first, fall back to old one
    let result;
    try {
      result = execSync('reg query "HKLM\\Software\\Clank CLI" /ve', { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      result = execSync('reg query "HKLM\\Software\\LlamaTalk CLI" /ve', { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    }
    const match = result.match(/REG_SZ\s+(.+)/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

// Called on every EXE startup — silently writes clank.cmd next to the EXE so
// the "clank" shorthand works in CMD immediately after download, no --install needed.
// Skipped if the NSIS installer already placed clank.cmd in Program Files.
export function ensureClankCmd() {
  if (!process.pkg) return;
  const currentDir = dirname(process.execPath);
  const nsisDir = getNsisInstalledDir();
  // NSIS installed to a different location — installer already wrote clank.cmd there
  if (nsisDir && nsisDir.toLowerCase() !== currentDir.toLowerCase()) return;
  const cmdPath = join(currentDir, "clank.cmd");
  try {
    writeFileSync(cmdPath, `@echo off\r\n"%~dp0ClankCLI.exe" %*\r\n`, "utf8");
  } catch {
    // Silent — don't fail startup if the directory is read-only
  }
}

export function runInstall() {
  console.log(`\n${ORANGE}${BOLD}ClankCLI — Install${RESET}\n`);

  const nsisDir = getNsisInstalledDir();

  // Always clean up any stale PS profile entries from old installs.
  // The PS profile approach caused "scripts disabled" errors on restricted systems;
  // clank.cmd in PATH works in both CMD and PowerShell without a profile entry.
  removeFromPsProfile();

  if (nsisDir) {
    // NSIS-installed: installer already wrote clank.cmd to Program Files and added
    // Program Files to the system PATH. Nothing more to do.
    console.log(GREEN + `  Installed at: ${nsisDir}` + RESET);
    console.log(DIM + "  'clank' is available in CMD and PowerShell via system PATH." + RESET);
  } else {
    // Standalone EXE: write clank.cmd next to EXE and add to user PATH.
    const installDir = getInstallDir();
    const cmdPath = join(installDir, "clank.cmd");
    writeFileSync(cmdPath, `@echo off\r\n"%~dp0ClankCLI.exe" %*\r\n`, "utf8");
    console.log(GREEN + `  Created: ${cmdPath}` + RESET);
    addToPath(installDir);
  }

  console.log(GREEN + "\n  Setup complete." + RESET);
  console.log(DIM + "  Open a new CMD or PowerShell window and type 'clank' to start." + RESET);
  console.log(DIM + `\n  To uninstall: ClankCLI --uninstall\n` + RESET);
}

export function runUninstall() {
  console.log(`\n${ORANGE}${BOLD}ClankCLI — Uninstall${RESET}\n`);

  const installDir = getInstallDir();

  // 1. Remove clank.cmd (and old llama.cmd if present)
  const cmdPath = join(installDir, "clank.cmd");
  if (existsSync(cmdPath)) {
    unlinkSync(cmdPath);
    console.log(GREEN + `  Removed: ${cmdPath}` + RESET);
  } else {
    console.log(DIM + "  clank.cmd not found (already removed)." + RESET);
  }
  const oldCmdPath = join(installDir, "llama.cmd");
  if (existsSync(oldCmdPath)) {
    unlinkSync(oldCmdPath);
    console.log(GREEN + `  Removed old shorthand: ${oldCmdPath}` + RESET);
  }

  // 2. Remove from PS profile
  removeFromPsProfile();

  // 3. Remove install dir from user PATH
  removeFromPath(installDir);

  console.log(GREEN + "\n  Uninstall complete." + RESET + "\n");
}
