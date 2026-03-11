import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const { version } = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));

// Resolve paths
const exeSrc  = join(projectRoot, `dist/ClankCLI_${version}.exe`);
const iconSrc = join(projectRoot, "icons/cli-icon.ico");
const nsiFile = join(projectRoot, `dist/installer.nsi`);
const outFile = join(projectRoot, `dist/Clank CLI_${version}_setup.exe`);

// Find makensis — prefer Tauri's cached copy, fall back to system PATH
function findMakensis() {
  const tauriPath = join(
    process.env.LOCALAPPDATA || "",
    "tauri", "NSIS", "makensis.exe"
  );
  if (existsSync(tauriPath)) return tauriPath;

  try {
    execSync("makensis /VERSION", { stdio: "pipe" });
    return "makensis";
  } catch {
    return null;
  }
}

const makensis = findMakensis();
if (!makensis) {
  console.error("Error: makensis not found. Run a Tauri Desktop build first to cache NSIS.");
  process.exit(1);
}

if (!existsSync(exeSrc)) {
  console.error(`Error: EXE not found at ${exeSrc} — run npm run build:exe first.`);
  process.exit(1);
}

// Escape backslashes for NSIS string literals
const exeSrcNsi  = exeSrc.replaceAll("\\", "\\\\");
const iconSrcNsi = iconSrc.replaceAll("\\", "\\\\");
const outFileNsi = outFile.replaceAll("\\", "\\\\");
const nsisDir    = dirname(makensis).replaceAll("\\", "\\\\");

// NOTE on NSIS string escaping used below:
//   $$varname  → literal $varname  (prevents NSIS from treating PS variables as NSIS variables)
//   $\\"       → literal "         ($\" escape in NSIS double-quoted strings)
//   $\\r$\\n   → CR+LF             (NSIS newline escape sequences)
//   $INSTDIR, $TEMP, etc. → expanded by NSIS at install time (correct behaviour)
//   \\\\       → \\  in NSIS       (JS template \\→\ then NSIS \\→\\ in path; Windows accepts both)

const nsiScript = `
Unicode true

!define PRODUCT_NAME    "Clank CLI"
!define PRODUCT_VERSION "${version}"
!define PRODUCT_EXE     "ClankCLI.exe"
!define UNINSTALL_KEY   "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\ClankCLI"

Name "\${PRODUCT_NAME} \${PRODUCT_VERSION}"
OutFile "${outFileNsi}"

; Install to 64-bit Program Files — requires admin elevation
InstallDir "$PROGRAMFILES64\\\\Clank CLI"
InstallDirRegKey HKLM "Software\\\\Clank CLI" ""
RequestExecutionLevel admin
SetCompressor lzma

!addincludedir "${nsisDir}\\\\..\\\\Include"
!include "LogicLib.nsh"
!include "MUI2.nsh"

!define MUI_ICON "${iconSrcNsi}"
!define MUI_UNICON "${iconSrcNsi}"
!define MUI_WELCOMEPAGE_TITLE "Install Clank CLI \${PRODUCT_VERSION}"
!define MUI_WELCOMEPAGE_TEXT "Clank CLI lets you chat with local and cloud AI models from any terminal window.$\\r$\\n$\\r$\\nThis will install Clank CLI to Program Files and add it to the system PATH."
!define MUI_FINISHPAGE_TITLE "Clank CLI Installed"
!define MUI_FINISHPAGE_TEXT "Clank CLI \${PRODUCT_VERSION} is ready.$\\r$\\n$\\r$\\nOpen a new CMD or PowerShell window and type:$\\r$\\n  clank$\\r$\\n$\\r$\\nto start chatting."
!define MUI_FINISHPAGE_NOAUTOCLOSE

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ── Install ────────────────────────────────────────────────────────────────────
Section "Install"
  SetOutPath "$INSTDIR"
  File "${exeSrcNsi}"
  Rename "$INSTDIR\\\\ClankCLI_${version}.exe" "$INSTDIR\\\\ClankCLI.exe"

  ; Remove any leftover versioned EXEs from previous updates (both old and new names)
  FileOpen $R0 "$TEMP\\\\clankcli-cleanup.ps1" w
  FileWrite $R0 "Get-ChildItem -LiteralPath '$INSTDIR' -Filter 'ClankCLI_*.exe' | Remove-Item -Force -ErrorAction SilentlyContinue$\\r$\\n"
  FileWrite $R0 "Get-ChildItem -LiteralPath '$INSTDIR' -Filter 'LlamaTalkCLI_*.exe' | Remove-Item -Force -ErrorAction SilentlyContinue$\\r$\\n"
  FileClose $R0
  nsExec::ExecToLog 'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$TEMP\\\\clankcli-cleanup.ps1"'
  Delete "$TEMP\\\\clankcli-cleanup.ps1"

  ; Clean up any stale ClankCLI/LlamaTalkCLI PS profile entries from old installs.
  ; Uses GetFolderPath('MyDocuments') — works correctly for the installing user
  ; even when the process is elevated via UAC (same user, elevated token).
  FileOpen $R0 "$TEMP\\\\clankcli-ps-profile-cleanup.ps1" w
  FileWrite $R0 "$$p = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'WindowsPowerShell\\Microsoft.PowerShell_profile.ps1'$\\r$\\n"
  FileWrite $R0 "if (Test-Path $$p) {$\\r$\\n"
  FileWrite $R0 "  $$lines = Get-Content $$p -ErrorAction SilentlyContinue$\\r$\\n"
  FileWrite $R0 "  if ($$lines) {$\\r$\\n"
  FileWrite $R0 "    $$keep = $$lines | Where-Object { $$_ -notmatch '# ClankCLI' -and $$_ -notmatch '# LlamaTalkCLI' -and $$_ -notmatch 'function clankcli' -and $$_ -notmatch 'function llamatalkcli' -and $$_ -notmatch 'ClankCLI\\.exe' -and $$_ -notmatch 'LlamaTalkCLI\\.exe' -and $$_ -notmatch 'Set-Alias.*clank' -and $$_ -notmatch 'Set-Alias.*llama' }$\\r$\\n"
  FileWrite $R0 "    if ($$keep.Count -lt $$lines.Count) { Set-Content -Path $$p -Value $$keep -ErrorAction SilentlyContinue }$\\r$\\n"
  FileWrite $R0 "  }$\\r$\\n"
  FileWrite $R0 "}$\\r$\\n"
  FileClose $R0
  nsExec::ExecToLog 'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$TEMP\\\\clankcli-ps-profile-cleanup.ps1"'
  Delete "$TEMP\\\\clankcli-ps-profile-cleanup.ps1"

  ; Copy the running installer into Program Files with its original versioned name
  CopyFiles /SILENT "$EXEPATH" "$INSTDIR\\\\Clank CLI_${version}_setup.exe"

  ; Remove old versioned setup and uninstall files from previous version installs (both old and new names)
  FileOpen $R0 "$TEMP\\\\clankcli-ver-cleanup.ps1" w
  FileWrite $R0 "$$d = '$INSTDIR'$\\r$\\n"
  FileWrite $R0 "Get-ChildItem -LiteralPath $$d -Filter 'Clank CLI_*_setup.exe' | Where-Object { $$_.Name -ne 'Clank CLI_${version}_setup.exe' } | Remove-Item -Force -ErrorAction SilentlyContinue$\\r$\\n"
  FileWrite $R0 "Get-ChildItem -LiteralPath $$d -Filter 'Clank CLI_*_uninstall.exe' | Where-Object { $$_.Name -ne 'Clank CLI_${version}_uninstall.exe' } | Remove-Item -Force -ErrorAction SilentlyContinue$\\r$\\n"
  FileWrite $R0 "Get-ChildItem -LiteralPath $$d -Filter 'LlamaTalk CLI_*_setup.exe' | Remove-Item -Force -ErrorAction SilentlyContinue$\\r$\\n"
  FileWrite $R0 "Get-ChildItem -LiteralPath $$d -Filter 'LlamaTalk CLI_*_uninstall.exe' | Remove-Item -Force -ErrorAction SilentlyContinue$\\r$\\n"
  FileClose $R0
  nsExec::ExecToLog 'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$TEMP\\\\clankcli-ver-cleanup.ps1"'
  Delete "$TEMP\\\\clankcli-ver-cleanup.ps1"

  ; Write clank.cmd shorthand (uses %~dp0 so it works from any PATH lookup)
  FileOpen $R0 "$INSTDIR\\\\clank.cmd" w
  FileWrite $R0 "@echo off$\\r$\\n"
  FileWrite $R0 "$\\"%~dp0ClankCLI.exe$\\" %*$\\r$\\n"
  FileClose $R0

  ; Remove old llama.cmd if present from previous LlamaTalk installation
  Delete "$INSTDIR\\\\llama.cmd"

  ; Add install dir to system PATH if not already present
  FileOpen $R0 "$TEMP\\\\clankcli-path-add.ps1" w
  FileWrite $R0 "$$instdir = '$INSTDIR'$\\r$\\n"
  FileWrite $R0 "$$p = [Environment]::GetEnvironmentVariable('Path', 'Machine')$\\r$\\n"
  FileWrite $R0 "$$dirs = ($$p -split ';') | Where-Object { $$_ -ne '' }$\\r$\\n"
  FileWrite $R0 "if ($$dirs -notcontains $$instdir) { [Environment]::SetEnvironmentVariable('Path', ($$dirs + $$instdir) -join ';', 'Machine') }$\\r$\\n"
  FileClose $R0
  nsExec::ExecToLog 'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$TEMP\\\\clankcli-path-add.ps1"'
  Delete "$TEMP\\\\clankcli-path-add.ps1"
  ; Broadcast PATH change to running processes
  SendMessage 65535 26 0 "STR:Environment" /TIMEOUT=5000

  ; Register in Add/Remove Programs (HKLM — machine-wide)
  WriteRegStr  HKLM "\${UNINSTALL_KEY}" "DisplayName"     "Clank CLI"
  WriteRegStr  HKLM "\${UNINSTALL_KEY}" "DisplayVersion"  "\${PRODUCT_VERSION}"
  WriteRegStr  HKLM "\${UNINSTALL_KEY}" "Publisher"       "Clank"
  WriteRegStr  HKLM "\${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr  HKLM "\${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\\\\Clank CLI_${version}_uninstall.exe"'
  WriteRegDWORD HKLM "\${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "\${UNINSTALL_KEY}" "NoRepair"  1

  ; Store install location so uninstaller can find it
  WriteRegStr HKLM "Software\\\\Clank CLI" "" "$INSTDIR"
  WriteUninstaller "$INSTDIR\\\\Clank CLI_${version}_uninstall.exe"
SectionEnd

; ── Uninstall ──────────────────────────────────────────────────────────────────
Section "Uninstall"
  ; Remove install dir from system PATH
  FileOpen $R0 "$TEMP\\\\clankcli-path-rm.ps1" w
  FileWrite $R0 "$$target = '$INSTDIR'$\\r$\\n"
  FileWrite $R0 "$$p = [Environment]::GetEnvironmentVariable('Path', 'Machine')$\\r$\\n"
  FileWrite $R0 "$$dirs = ($$p -split ';') | Where-Object { $$_ -ne '' -and $$_ -ne $$target }$\\r$\\n"
  FileWrite $R0 "[Environment]::SetEnvironmentVariable('Path', ($$dirs -join ';'), 'Machine')$\\r$\\n"
  FileClose $R0
  nsExec::ExecToLog 'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$TEMP\\\\clankcli-path-rm.ps1"'
  Delete "$TEMP\\\\clankcli-path-rm.ps1"
  SendMessage 65535 26 0 "STR:Environment" /TIMEOUT=5000

  ; Clean up any stale PS profile entries on uninstall too (both old and new names)
  FileOpen $R0 "$TEMP\\\\clankcli-ps-profile-cleanup.ps1" w
  FileWrite $R0 "$$p = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'WindowsPowerShell\\Microsoft.PowerShell_profile.ps1'$\\r$\\n"
  FileWrite $R0 "if (Test-Path $$p) {$\\r$\\n"
  FileWrite $R0 "  $$lines = Get-Content $$p -ErrorAction SilentlyContinue$\\r$\\n"
  FileWrite $R0 "  if ($$lines) {$\\r$\\n"
  FileWrite $R0 "    $$keep = $$lines | Where-Object { $$_ -notmatch '# ClankCLI' -and $$_ -notmatch '# LlamaTalkCLI' -and $$_ -notmatch 'function clankcli' -and $$_ -notmatch 'function llamatalkcli' -and $$_ -notmatch 'ClankCLI\\.exe' -and $$_ -notmatch 'LlamaTalkCLI\\.exe' -and $$_ -notmatch 'Set-Alias.*clank' -and $$_ -notmatch 'Set-Alias.*llama' }$\\r$\\n"
  FileWrite $R0 "    if ($$keep.Count -lt $$lines.Count) { Set-Content -Path $$p -Value $$keep -ErrorAction SilentlyContinue }$\\r$\\n"
  FileWrite $R0 "  }$\\r$\\n"
  FileWrite $R0 "}$\\r$\\n"
  FileClose $R0
  nsExec::ExecToLog 'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$TEMP\\\\clankcli-ps-profile-cleanup.ps1"'
  Delete "$TEMP\\\\clankcli-ps-profile-cleanup.ps1"

  Delete "$INSTDIR\\\\ClankCLI.exe"
  Delete "$INSTDIR\\\\LlamaTalkCLI.exe"
  Delete "$INSTDIR\\\\clank.cmd"
  Delete "$INSTDIR\\\\llama.cmd"
  Delete "$INSTDIR\\\\Clank CLI_${version}_setup.exe"
  Delete "$INSTDIR\\\\Clank CLI_${version}_uninstall.exe"
  RMDir  "$INSTDIR"

  DeleteRegKey HKLM "\${UNINSTALL_KEY}"
  DeleteRegKey HKLM "Software\\\\Clank CLI"
  DeleteRegKey HKLM "Software\\\\LlamaTalk CLI"
SectionEnd
`;

mkdirSync(join(projectRoot, "dist"), { recursive: true });
writeFileSync(nsiFile, nsiScript, "utf8");

console.log(`Building installer for Clank CLI v${version}...`);
execSync(`"${makensis}" "${nsiFile}"`, { stdio: "inherit" });
console.log(`Built: ${outFile}`);
