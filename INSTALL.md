# Install LlamaTalkCLI

LlamaTalkCLI is a standalone Windows terminal app. No Node.js or admin rights required for the direct EXE. The NSIS installer handles everything automatically.

---

## Option A — Windows Installer (Recommended)

Download `LlamaTalk CLI_X.Y.Z_setup.exe` from [Releases](https://github.com/ItsTrag1c/LlamaTalk-CLI/releases/latest) and run it.

The installer will:
- Place `LlamaTalkCLI.exe` in `C:\Program Files\LlamaTalk CLI\`
- Add the install folder to the **system PATH** (available to all users)
- Write a `llama.cmd` shorthand so `llama` works in CMD and PowerShell immediately
- Register the app in **Add/Remove Programs**

Open a new terminal window after install, then:

```
llama                        Start interactive chat
llama "What is 2+2?"         One-shot answer
llama -m llama3              Use a specific model
llama -M "Summarize this"    One-shot (flag form)
llama --help                 Show all options
```

---

## Option B — Direct EXE (No Install)

Download `LlamaTalkCLI.exe` and place it anywhere.

- On first run, `llama.cmd` is automatically written next to the EXE — `llama` works in CMD immediately with no setup
- No admin rights required
- No PATH changes made automatically

To additionally ensure the folder is in your PATH and `llama` works from anywhere:

```cmd
LlamaTalkCLI --install
```

To remove those PATH and shorthand entries later:

```cmd
LlamaTalkCLI --uninstall
```

---

## First Run

On first launch, a short onboarding wizard walks you through:

1. Setting your display name
2. Optionally creating a PIN (enables encryption for API keys and history)
3. Choosing your Ollama server URL (defaults to `localhost:11434`)

You can change all of these later via `/settings` and `/set` commands.

---

## Updating

### Via `/update` command

Type `/update` inside LlamaTalkCLI. It checks GitHub for a newer version and, if found, downloads and installs it automatically with a live progress bar. SHA-256 checksum verification is performed before applying the update. No manual file download required.

A dim update hint also appears after the banner at startup whenever a newer version is available on GitHub.

### Via installer

Download and run the new `LlamaTalk CLI_X.Y.Z_setup.exe` from [Releases](https://github.com/ItsTrag1c/LlamaTalk-CLI/releases/latest). Installs over the existing version. Settings and history are preserved.

---

## Command-Line Flags

| Flag | Description |
|------|-------------|
| `-v`, `--version` | Print version and exit |
| `-h`, `--help` | Print help and exit |
| `-m`, `--model <name>` | Start with a specific model |
| `-M`, `--message <text>` | One-shot message (non-interactive) |
| `--word-delay <ms>` | Override word-by-word display delay |
| `--no-history` | Don't load or save conversation history |
| `--no-banner` | Skip the startup ASCII banner |
| `--install` | Add `llama` shorthand and PATH entry |
| `--uninstall` | Remove shell integration |

You can also pass a message as a bare argument: `llama "What is 2+2?"` — this is equivalent to using `-M`.

---

## Uninstall

**Installer users:** Use Add/Remove Programs, or run the `Uninstall.exe` in the install folder.

**Direct EXE users:** Delete `LlamaTalkCLI.exe` and `llama.cmd`. Run `LlamaTalkCLI --uninstall` first if you previously ran `--install`.

---

## Notes

- Settings and conversation history are stored in `%APPDATA%\LlamaTalkCLI\`
- To remove all data, delete that folder
- Cloud API keys are stored in `config.json` in that folder — encrypted when a PIN is set, never shared or exported
- `--uninstall` removes shell integration only; it does not delete the EXE or your data
- Supports both Ollama and OpenAI-compatible local servers (llama.cpp, LM Studio, vLLM) — auto-detected, no manual config needed
