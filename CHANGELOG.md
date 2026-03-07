# Changelog — LlamaTalkCLI

Last updated: 2026-03-07 (v0.9.12)

---

## v0.9.12 — 2026-03-06

### New Provider
- **OpenCode support** — added OpenCode as a cloud provider. Connects to OpenCode Zen API using OpenAI-compatible streaming. Provides access to 12 models including GPT-5.x, Claude 4.6, Gemini 3.x, MiniMax, Kimi, and Big Pickle — all through a single API key. Configure via onboarding or `/set api-key opencode <key>`.

---

## v0.9.11 — 2026-03-06

### Security
- **Google API key moved to request header** — The Google Gemini API key is no longer passed as a URL query parameter (`?key=`). It is now sent via the `x-goog-api-key` HTTP header in both streaming and non-streaming requests, preventing the key from appearing in server logs, browser history, or network proxy logs.

---

## v0.9.10 — 2026-03-04

### Bug Fixes
- **Fixed cloud model misidentification** — Local models with the same name as cloud models (e.g., "gpt-4o") are no longer misidentified as cloud providers. Cloud models are now only shown when their provider is enabled AND an API key is configured.
- **Fixed /models showing unavailable cloud models** — Cloud models no longer appear in the model list unless a valid API key is set for that provider, preventing confusion when selecting a cloud model without credentials.
- **Fixed config import with null values** — Importing config files with null values no longer overwrites existing settings with null. Null values are now skipped during merge.
- **Fixed Esc detection on non-TTY terminals** — The app no longer attempts raw mode on non-interactive stdin, preventing errors when running in certain environments.

---

## v0.9.0 — 2026-03-04

### New Features
- **Multi-server support** — Connect to multiple local model servers simultaneously. Use `/set add-server <url>` to add a server, `/set remove-server <url>` to remove one, and `/set servers` to list all configured servers. Models from all servers are aggregated in `/models` and chat is routed to the correct server automatically.
- **Running model detection** — The `/models` command now shows a `[running]` tag next to models currently loaded in memory on Ollama servers.

### Improvements
- **"Ollama" renamed to "Local Server"** — All user-facing text has been updated: onboarding says "Local server URL" and "Testing server connection," `/set ollama-url` is now `/set server-url` (old name still works as alias), `/settings` shows "Server URL," and `/help` lists the new commands.

---

## v0.8.1 — 2026-03-04

### Bug Fixes
- **Fixed crash after model response** — A scoping error caused `ReferenceError: result is not defined` after every streamed response, crashing the chat loop. The TK/S summary line now correctly accesses the stream result.
- **Fixed inaccurate token counts for OpenAI-compatible backends** — When using llama.cpp, LM Studio, vLLM, or other OpenAI-compatible servers, the token counter was falling back to event-counted tokens instead of actual API-reported counts. The streaming request now includes `stream_options: { include_usage: true }`, so backends that support it return real usage data in the final chunk.

---

## v0.8.0 — 2026-03-04

### New Features
- **Tokens per second (TK/S) after every response** — After each model response, a summary line shows the output token count and generation speed (e.g. `● 156 tokens · 31.2 tk/s`). When using Ollama, the speed is calculated from the server-reported `eval_duration` for accuracy that excludes network latency. Cloud providers use wall-clock timing.
- **Actual API token counts** — All five providers (Ollama, OpenAI-compatible, Anthropic, Google, OpenAI) now return real token usage data from their streaming responses instead of the previous character-based estimation. The token counter before the input prompt shows exact counts (e.g. `● 206 tokens`) after the first response, or estimated counts (with `~` prefix) before any response is received.

---

## v0.7.5 — 2026-03-04

### Improvements
- **Auto-detect running model on startup** — The app now queries your backend for the currently loaded model when it launches and auto-switches to it, so your CLI always reflects what's actually running. Works with Ollama (`/api/ps`), llama.cpp, LM Studio, and other OpenAI-compatible servers. Skipped when you explicitly pass `--model` on the command line.
- **Responsive banner** — The startup banner now adapts to narrow terminals (under 70 columns) by switching to a compact header instead of wrapping. Resizing the terminal window while at the input prompt redraws the banner and hint bar at the new width.

---

## v0.7.4 — 2026-03-04

### Bug Fixes
- **Auto-detect model on startup** — When no model was explicitly selected, the chat prompt displayed a stale or empty model name. The app now auto-detects the first available model from your backend on startup and selects it automatically. The model only changes when you explicitly switch via `/model`.

---

## v0.7.3 — 2026-03-04

### New Features
- **PowerShell one-liner install** — Run `irm .../install.ps1 | iex` in PowerShell to download and install the latest release with no admin rights needed. Installs to `%USERPROFILE%\LlamaTalkCLI\`, writes the `llama` shorthand, and adds it to your user PATH automatically.

### Improvements
- **`/update` works from Program Files** — When installed to a protected directory like Program Files, `/update` now downloads to a temp folder and elevates the update via a UAC prompt. Previously the update would silently fail due to write permissions.

---

## v0.7.2 — 2026-03-04

### Bug Fixes
- **Fixed llama.cpp responses not appearing in chat** — llama.cpp servers that serve both Ollama-compatible and OpenAI-compatible endpoints were misidentified as native Ollama, causing the streaming parser to silently discard all tokens. Backend detection now validates the response body and correctly identifies llama.cpp as OpenAI-compatible. Added fallback parsing and auto-detection on first stream when backend type was never explicitly set.

---

## v0.7.1 — 2026-03-04

### Bug Fixes
- **Fixed streaming responses showing blank text** — Streaming used the browser-style `ReadableStream` API which doesn't work reliably in the standalone EXE. Switched to Node.js native HTTP streams so tokens arrive correctly with all backends including llama.cpp.
- **`/clear` now clears the terminal screen** — The `/clear` command now wipes the terminal and reprints the LlamaTalkCLI banner, giving you a clean slate instead of just clearing the conversation history.

---

## v0.7.0 — 2026-03-04

### New Features
- **True streaming responses** — Responses now appear token-by-token in real time as the model generates them. No more waiting for the entire response to load before seeing output. Works with all providers: Ollama, Anthropic, Google, and OpenAI.
- **llama.cpp / OpenAI-compatible server support** — LlamaTalkCLI now auto-detects whether your server is Ollama or an OpenAI-compatible API (llama.cpp, vLLM, etc.). The `/models` command and chat automatically use the correct endpoints.
- **Automatic backend detection on startup** — The server type is detected in the background when the app launches. Changing your server URL via `/set ollama-url` also re-detects the backend type.
- **Streaming cancellation preserves partial responses** — Pressing Esc mid-stream now keeps the tokens already received in the conversation history instead of discarding the entire response.
- **Word delay as stream throttle** — The word delay setting now throttles the display of streamed tokens (0 = instant, >0 = buffered at interval) instead of faking streaming after the full response loads.

---

## v0.6.0 — 2026-03-03

### Security
- **Minimum PIN length enforced** — PINs must now be at least 4 characters. Both the onboarding wizard and the `/set pin` command reject shorter PINs with a clear message.
- **Import restricted to `.json` files** — The `/import` command now validates that the file path ends with `.json` before reading it, preventing accidental import of non-config files.
- **Upgraded jimp dependency** — Updated jimp from v0.16 to v1.6, removing the `phin` transitive dependency and its associated network vulnerability. The CLI icon generation script has been rewritten for the new API.

### New Features
- **Session inactivity timeout** — After 30 minutes of inactivity (no input), the session locks and prompts for your PIN before continuing. Configurable via `/set timeout <0–480>` (minutes). Set to `0` to disable. Default is 30 minutes. If no PIN is set, the session simply resumes with a new readline interface.

---

## v0.5.5 — 2026-03-03

### Bug Fixes
- **Fixed registry error message on startup** — On systems where LlamaTalk CLI is not installed via the Windows installer, a spurious "The system was unable to find the specified registry key or value" error was printed to the terminal on every launch. The registry check is now fully silent as intended.

---

## v0.5.4 — 2026-03-03

### Bug Fixes
- **Fixed "Pkg: Error reading from file" crash on launch** — The version metadata stamping step (`rcedit`) introduced in v0.5.3 was corrupting the embedded Node.js runtime inside the EXE, making it impossible to start. Removed the post-build stamping step to restore a working executable.

---

## v0.5.3 — 2026-03-03

### Bug Fixes
- **Fixed EXE showing wrong version in file properties** — The standalone EXE's Windows file properties (right-click → Properties → Details) showed the Node.js runtime version instead of the app version. The build now stamps the correct version, product name, and description into the EXE metadata.

---

## v0.5.2 — 2026-03-03

### Bug Fixes
- **Fixed `/update` falsely reporting "up to date"** — When the GitHub update check failed (network error, API rate limit, etc.), the error was silently swallowed and `/update` reported "LlamaTalkCLI is up to date" instead of telling you the check failed. Now shows "Could not check for updates — try again later" when the check fails.

---

## v0.5.1 — 2026-03-03

### Bug Fixes
- **Fixed `/import` crash** — The `/import` command crashed because `readFileSync` was not imported. Now loads the file correctly.
- **Fixed `/update` crash when running as EXE** — The `/update` command crashed when running from the standalone EXE because `dirname` was not imported. Path resolution now works correctly.
- **Fixed conversation history saved without encryption** — After a successful assistant response, conversation history was saved without passing the encryption key, causing it to be written in plaintext even when a PIN was set. History is now always encrypted when an encryption key is available.

---

## v0.5.0 — 2026-03-03

### Security
- **API keys encrypted at rest** — Cloud API keys (Anthropic, Google, OpenAI) are now encrypted in `config.json` using AES-256-GCM with a key derived from your PIN. Keys are decrypted in memory only after successful PIN entry and are never written back to disk in plaintext. Users without a PIN are unaffected — keys remain as before.
- **Conversation history encrypted at rest** — `history.json` is now encrypted with the same PIN-derived key. History becomes unreadable without the correct PIN. Existing plaintext history files are transparently encrypted on the next save after upgrading.
- **Config and history files locked to current user** — After every write to `config.json` or `history.json`, the app restricts file permissions to the current Windows user only via `icacls`, preventing other users on a shared system from reading your data.
- **Encryption key rotation on PIN change** — Changing your PIN via `/set pin` generates a new encryption salt, derives a new key, and re-encrypts all API keys and history in one step. Removing your PIN decrypts all data back to plaintext automatically.

---

## v0.4.0 — 2026-03-03

### Updates
- **GitHub update check at startup** — LlamaTalkCLI now checks GitHub for a newer version in the background while you log in. If one is available, a dim hint appears after the banner: `v0.x.x available — /update to install`.
- **`/update` downloads from GitHub** — If no pre-placed versioned EXE is found in the install folder, `/update` fetches the latest release directly from GitHub with a live progress bar. The download is verified with a SHA-256 checksum before the swap takes place.

### Interface
- **Model name as response header** — The word "Assistant" is replaced with the actual name of the model you're talking to (or its nickname if one is set). The label updates automatically when you switch models.
- **"You" label now in dark yellow** — Your name in the input prompt is now displayed in a distinct dark yellow color, making it easy to tell at a glance who said what.
- **Cleaner conversation history** — The token counter and keyboard shortcut hint now appear only at the current input line. When you scroll up through a conversation, neither element clutters the history — you see only your messages and model responses.

---

## v0.3.9 — 2026-03-03

### Interface
- **Token counter moved to bottom** — The token counter no longer appears above the input prompt before every message. It now appears once below each assistant response, showing the running conversation context total after each exchange.

---

## v0.3.8 — 2026-03-03

### Interface
- **Esc to cancel** — Press Esc while the model is generating a response to cancel it immediately. Works whether the model is still fetching or already displaying word-by-word. Cancelling during the fetch discards the response and removes it from history; cancelling during display stops the animation but keeps the full response in history. The thinking animation now shows "Esc to cancel" as a dim hint while generating.

---

## v0.3.7 — 2026-03-03

### Updates
- **Cleaner self-update** — When `/update` installs a newer version, it now removes all old versioned EXE files from the install folder in the same step, not just the one that was just installed. Likewise, the Windows installer automatically cleans up any leftover versioned EXEs from previous updates when a new version is installed.

---

## v0.3.6 — 2026-03-03

### Security
- **Stronger PIN protection** — PINs are now hashed using PBKDF2 with 100,000 iterations and a unique random salt per user, replacing the previous single-pass SHA-256 hash. Existing PINs are automatically upgraded to the new format the next time you log in — no action required.
- **Config import validation** — The `/import` command now validates every field in the imported file before applying it. Invalid types, out-of-range values, and unrecognized fields are rejected with a specific error message. Sensitive fields (PIN hash, API keys) are always excluded from imports regardless of file content.

---

## v0.3.5 — 2026-03-03

### Setup
- **PowerShell profile entries removed** — `LlamaTalkCLI --install` no longer writes a function or alias to the PowerShell profile. The `llama` command works in both CMD and PowerShell via the system PATH and `llama.cmd` without requiring any profile script, which eliminates the "running scripts is disabled" error that appeared on PowerShell startup. Running `--install` on an existing setup will automatically clean up any previously written profile entries.

---

## v0.3.4 — 2026-03-03

### Setup
- **PowerShell execution policy set automatically** — Running `LlamaTalkCLI --install` now sets the PowerShell execution policy to `RemoteSigned` for the current user before writing the profile script. This prevents the "running scripts is disabled" error that appeared on PowerShell startup after installing the `llama` shorthand.

---

## v0.3.3 — 2026-03-03

### Interface
- **Keyboard shortcuts bar** — A hint line appears before each prompt showing: Enter to send · ↑↓ prev inputs · Ctrl+L clear screen · Ctrl+C exit · /help. Centered to the terminal width.
- **Clean exit** — Pressing Ctrl+C or typing /quit clears the terminal and shows a clean goodbye message instead of leaving text mid-screen.
- **New session every run** — Conversation history is cleared on exit. Each time you run `llama`, you start a fresh session. If the app exits unexpectedly, the previous session is available for recovery on the next launch.

### Banner
- **Improved header font** — Switched from the Big font to the Slant font. The letters use diagonal connectors (`/` and `\`) that render cleanly in all modern terminals, fixing the visual gap that appeared at the tops of letters.

---

## v0.3.2 — 2026-03-03

### Setup
- **`llama` shorthand no longer created in download folder** — When LlamaTalk CLI is installed via the Windows installer, the `llama` shorthand is placed in Program Files alongside the app. The app no longer creates a duplicate shorthand file in the folder where the EXE was originally downloaded from.

---

## v0.3.1 — 2026-03-03

### Setup
- **Installer installs to Program Files** — The Windows installer now places LlamaTalk CLI in `Program Files` (64-bit) by default, matching standard Windows app conventions. A UAC prompt will appear during installation. The `llama` shorthand and system PATH are configured automatically by the installer.

---

## v0.3.0 — 2026-03-03

### Interface
- **Token counter starts at zero** — The token counter now shows `0` before any message is sent in a session. It only begins counting and animating after the first response is received, so the display always reflects tokens actively used in the current conversation.

---

## v0.2.9 — 2026-03-03

### Setup
- **Windows installer** — LlamaTalk CLI is now distributed as `LlamaTalk CLI_X.Y.Z_setup.exe`, matching the naming convention of LlamaTalk Desktop. The installer sets up the `llama` shorthand, PowerShell integration, and PATH automatically.
- **Automatic shell shorthand** — The `llama` command is now available in CMD immediately after first launch, with no extra setup step required.

---

## v0.2.8 — 2026-03-03

### Setup
- **Built-in shell integration** — Run `LlamaTalkCLI --install` to add the `llama` shorthand command in CMD and PowerShell, and ensure the install folder is in your user PATH. Run `LlamaTalkCLI --uninstall` to remove those entries. No separate installer script required.

---

## v0.2.7 — 2026-03-03

### Interface
- **Token counter** — A gold coin with a brief spinning animation appears above the prompt after each exchange, showing the estimated context token count for the current conversation.
- **Thinking animation** — Replaced the star pattern with a letter-by-letter reveal: "Thinking" builds one character at a time, then six asterisks pulse in at the same pace before looping.
- **`/speedup` / `/slowdown`** — Adjust the word-by-word response display speed on the fly in ±5 ms steps without opening settings.

---

## v0.2.6 — 2026-03-03

### Settings
- **`/temp` command** — Set response temperature from 0.0 (precise, deterministic) to 1.0 (creative, varied). Type `/temp` to view the current value or `/temp 0.4` to change it. Applies to Ollama, Anthropic, Google, and OpenAI models.

### Interface
- CLI EXE now has a custom icon: the LlamaTalk llama icon with an orange terminal badge (`>_`) in the corner.

---

## v0.2.5 — 2026-03-03

### Updates
- **`/update` command** — Type `/update` to check for a newer version of LlamaTalkCLI. If a newer EXE is found in the install folder, you'll be asked to confirm before it replaces the current version. All settings and conversation history are preserved automatically.

---

## v0.2.4 — 2026-03-03

### Security
- **API keys excluded from config export** — Cloud API keys (Anthropic, Google, OpenAI) are no longer included in files exported via `/export`. Only non-sensitive settings are exported; re-enter keys after importing on a new device.
- **Ollama URL validation** — The Ollama server URL is now validated before every request. Non-HTTP/HTTPS schemes and link-local addresses (169.254.x.x) are rejected.
- **Request timeouts** — All network calls now have timeouts: 10 s for Ollama connection checks, 120 s for Ollama chat responses, 60 s for cloud providers. A hung server no longer stalls the app indefinitely.
- **Timing-safe PIN verification** — PIN comparison now uses `crypto.timingSafeEqual` to prevent timing side-channel attacks.

### Interface
- Suppressed the Node.js experimental fetch API warning that appeared in the terminal on startup.

---

## v0.2.3 — 2026-03-03

### Banner
- Replaced block-letter title with figlet "Big" font ASCII art for **LlamaTalkCLI** — rendered in full orange and automatically centered to the current terminal window width.

---

## v0.2.2 — 2026-03-03

### Banner
- Improved block-letter ASCII art: A letters now have a proper triangular top, C opens in the correct direction, I is narrower and cleaner.

### Thinking animation
- Replaced the ASCII llama art with three orange stars that blink in a 1-2-3 counting pattern (★ · · → ★ ★ · → ★ ★ ★ → · · ·) while the model is responding.

### Shell
- `E:\LlamaTalk Files\` added to the Windows user PATH permanently — typing `llama` now works in any new CMD or PowerShell window without running the install script first.

---

## v0.2.1 — 2026-03-03

### Banner
- Replaced the ASCII llama art in the startup header with large 5-row block-letter text reading **LLAMATALKCLI** — LLAMA in orange, TALKCLI in white. Easier to read at a glance in any terminal.

---

## v0.2.0 — 2026-03-03

### CLI Arguments
- New command-line flags for non-interactive and scripted use
- `-v` / `--version` — print version and exit
- `-h` / `--help` — print usage reference and exit
- `-m` / `--model <name>` — use a specific model for the session
- `-M` / `--message <text>` — one-shot mode: send a message, print the response, and exit
- Positional argument shorthand: `llamatalkcli "your question"` works without `-M`
- `--no-history` — run without loading or saving conversation history
- `--no-banner` — suppress the llama banner (useful for scripts)
- `--word-delay <ms>` — override word-by-word delay for the session

### Shell Integration
- Run `Install-LlamaTalkCLI.ps1` to add `llamatalkcli` and `llama` as commands available in any PowerShell or CMD window. Pass `-UseExe` to run the standalone EXE; `-Uninstall` to remove the integration.

### Standalone EXE
- Standalone Windows EXE available — no Node.js installation required.

### Version Display
- App version shown in dim text next to the banner title on launch
- `llamatalkcli --version` prints the bare version string for scripting

---

## v0.1.0 — 2026-03-03

Initial release of LlamaTalkCLI, the terminal companion to LlamaTalk.

### Chat
- Full conversational chat from any PowerShell or CMD window
- Connects to local Ollama models and cloud providers (Anthropic, Google, OpenAI)
- Word-by-word response display with configurable delay
- Conversation history persists across sessions (reloaded on launch)
- `/clear` wipes in-memory and on-disk history to start fresh

### Llama Mascot
- Animated ASCII llama in orange ANSI with bobbing thinking animation
- Braille spinner cycling during model response
- Banner displayed on every launch

### First-Run Onboarding
- Interactive wizard for name, PIN, Ollama URL, cloud API keys, and default model
- Runs inline in the terminal — no browser, no GUI
- Skippable steps with sensible defaults

### Models
- Automatic Ollama model discovery via `/api/tags`
- Cloud model lists for Anthropic, Google, and OpenAI built-in
- `/models` lists all available models; `/model <name>` switches instantly
- Per-model nicknames via `/set nick <name>`
- Model hiding/unhiding via `/hide` and `/unhide`

### Slash Commands
- `/help` — full command reference
- `/settings` — config summary with masked API keys
- `/set ollama-url`, `/set api-key`, `/set provider`, `/set word-delay`
- `/set prompt [model]` — inline system prompt editor
- `/set pin`, `/set pin-frequency` — PIN management
- `/export [path]`, `/import <path>` — config portability
- `/quit` / `/exit` — graceful exit

### Security
- Optional PIN protection with SHA-256 + salt hashing
- PIN frequency: always, 30 days, or never
- API keys stored in local config file, never exported
- Config at `%APPDATA%\LlamaTalkCLI\config.json`

### Setup
- Pure Node.js 18+ — no install required beyond Node
- Launch via `LlamaTalkCLI.bat` or `node index.js`
- Optional standalone `.exe` build via `pkg`

---

## Upcoming

- Multi-profile support
- Conversation export to markdown or text
- Syntax highlighting for code blocks in responses
- Session naming and search
- macOS / Linux support

---

Last updated: 2026-03-07 (v0.9.12)

