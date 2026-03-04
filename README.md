# LlamaTalk CLI

> Chat with local and cloud AI from any terminal window on Windows.

LlamaTalk CLI is a standalone Windows terminal app for chatting with [Ollama](https://ollama.com/) models and cloud AI providers — Anthropic Claude, Google Gemini, and OpenAI GPT. No browser. No Node.js required. Just type `llama`.

---

## Install

```powershell
irm https://raw.githubusercontent.com/ItsTrag1c/LlamaTalk-CLI/master/install.ps1 | iex
```

Run this in PowerShell to download and install the latest release. Open a new terminal and type `llama`.

---

## Download

**[→ Latest Release](https://github.com/ItsTrag1c/LlamaTalk-CLI/releases/latest)**

| File | Description |
|------|-------------|
| `LlamaTalk CLI_x.y.z_setup.exe` | Windows installer — installs to Program Files, adds `llama` to PATH |
| `LlamaTalkCLI_x.y.z.exe` | Standalone EXE — run anywhere, no admin rights needed |
| `checksums.txt` | SHA-256 checksums for verification |

---

## Features

- **Local models** — connects to any [Ollama](https://ollama.com/) server on your machine or network
- **OpenAI-compatible servers** — llama.cpp, LM Studio, vLLM, and other OpenAI-compatible backends auto-detected
- **Cloud models** — Anthropic Claude, Google Gemini, OpenAI GPT (API key required)
- **True streaming** — responses appear token-by-token in real time from all providers
- **Token counter** — TK/S summary after every response with actual API-reported token counts
- **Word-by-word display** — animated response output with configurable speed (throttles stream)
- **PIN protection** — optional, PBKDF2-hashed; API keys and history encrypted at rest (AES-256-GCM)
- **Conversation history** — persists across sessions, encrypted when PIN is set, clears on exit
- **Per-model system prompts** — set a different base prompt for each model
- **Self-updating** — `/update` checks GitHub and downloads the latest version automatically
- **One-shot mode** — `llama "your question"` for scripting and pipelines
- **Esc to cancel** — press Esc mid-stream to stop generation; partial responses are preserved
- **Temperature control** — `/temp 0.0–1.0` applies to all providers
- **Zero runtime dependencies** — single ~36 MB EXE includes the Node.js runtime

---

## Quick Start

### Option A — PowerShell One-Liner (Recommended)

```powershell
irm https://raw.githubusercontent.com/ItsTrag1c/LlamaTalk-CLI/master/install.ps1 | iex
```

No admin rights needed. Installs to `%USERPROFILE%\LlamaTalkCLI\` and adds `llama` to your PATH.

### Option B — Installer

1. Download the latest installer from [Releases](https://github.com/ItsTrag1c/LlamaTalk-CLI/releases/latest)
2. Run the installer (UAC prompt will appear)
3. Open a **new** CMD or PowerShell window and type `llama`

### Option C — Standalone EXE

1. Download `LlamaTalkCLI.exe` from [Releases](https://github.com/ItsTrag1c/LlamaTalk-CLI/releases/latest)
2. Place it anywhere — `llama.cmd` is auto-created next to it on first run
3. Run `LlamaTalkCLI.exe` directly, or type `llama` from the same folder

See [INSTALL.md](INSTALL.md) for full setup, update, and uninstall instructions.

---

## Usage

```
llama                                    Start interactive chat
llama "What is 2+2?"                     One-shot question and exit
llama -m llama3.2                        Use a specific model for this session
llama -m claude-sonnet-4-5 "Explain..."  One-shot with a cloud model
llama --no-history                       Chat without saving history
llama --word-delay 0                     Instant output (no animation)
llama --no-banner                        Skip the ASCII banner (useful in scripts)
llama --version                          Print version and exit
```

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/help` | Full command reference |
| `/models` | List all available models |
| `/model <name>` | Switch to a model |
| `/update` | Check for and install the latest version |
| `/settings` | Show current config |
| `/set ollama-url <url>` | Update Ollama server URL |
| `/set api-key <provider> <key>` | Set a cloud API key (anthropic / google / openai) |
| `/set provider enable\|disable <p>` | Toggle a cloud provider |
| `/set prompt [model]` | Edit system prompt for a model |
| `/set nick <name>` | Set a display nickname for the current model |
| `/set pin` | Change or remove your PIN |
| `/set pin-frequency <freq>` | PIN timing: always / 30days / never |
| `/set word-delay <ms>` | Set word-by-word animation delay (0–500) |
| `/temp [0.0–1.0]` | Show or set response temperature |
| `/speedup` / `/slowdown` | Adjust animation speed ±5 ms |
| `/hide <model>` / `/unhide <model>` | Hide or show a model from the list |
| `/export [path]` | Export config to a JSON file |
| `/import <path>` | Import config from a JSON file |
| `/clear` | Clear conversation history |
| `/quit` | Exit |

---

## Privacy

All settings and conversation history are stored locally at `%APPDATA%\LlamaTalkCLI\`. When a PIN is set, API keys and conversation history are encrypted at rest using AES-256-GCM. Config and history files are locked to your user account. Nothing is collected, tracked, or transmitted anywhere except to your chosen AI provider when you send a message. Cloud API keys are never included in exports.

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for full details.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

---

*Created by [ItsTrag1c](https://github.com/ItsTrag1c) — [MIT License](LICENSE)*
