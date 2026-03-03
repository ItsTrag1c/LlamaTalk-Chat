# LlamaTalk — Privacy Policy

**Effective Date:** March 2, 2026
**Last Updated:** March 3, 2026 (rev. 2)

---

## Overview

The LlamaTalk suite consists of two applications: **LlamaTalk Desktop**, a desktop application for conversing with local and cloud AI models, and **LlamaTalkCLI**, a terminal companion that provides the same capability from any CMD or PowerShell window.

**The short version:** All your data stays on your computer. We don't collect, share, or transmit any information about you or your conversations — except when you explicitly choose to use a cloud AI provider, in which case only your messages are sent to that provider's servers as described below.

---

## Data We Collect and Store

### LlamaTalk Desktop

LlamaTalk Desktop stores the following data **locally on your device only**, in your browser's localStorage:

- **Profile information** — Your username and PIN (hashed with PBKDF2, 100,000 iterations, random per-user salt)
- **Security questions & answers** — Three security question indices and hashed answers (for PIN recovery)
- **Conversations** — Full message history of all your chats
- **Export audit trail** — Timestamp of your most recent profile export (`lastExportTime`), displayed in Settings
- **Settings** — Your preferences including:
  - Ollama server URL
  - Selected AI model
  - Model display name (nickname)
  - Theme (light/dark/system)
  - Text size and scroll speed
  - PIN frequency requirement
  - Per-model system prompts ("Base Prompts")
  - Tray behavior preference
  - Temperature setting
  - Hidden models list
  - Enabled cloud providers

**Deletion log:** When you clear your data via "Clear Data & Users," a one-line timestamped entry is appended to `LlamaTalk-deletion-log.txt` in your application data folder. This file exists solely to give you an audit record of your own deletions and is never transmitted anywhere.

### LlamaTalkCLI

LlamaTalkCLI stores the following data **locally on your device only**, in `%APPDATA%\LlamaTalkCLI\`:

- **Config** (`config.json`) — Your name, hashed PIN, Ollama URL, cloud API keys (plaintext), per-model system prompts, model nicknames, and session preferences
- **Conversation history** (`history.json`) — Messages from the current session, used for crash recovery only

**Session history:** Conversation history is cleared automatically when you exit LlamaTalkCLI cleanly. If the application exits unexpectedly, the previous session's messages remain in `history.json` and are available on the next launch for recovery. Closing normally always starts a fresh session.

### Data Retention

- **Desktop conversations** — Retained until you delete them via the trash icon or "Clear Data & Users"
- **CLI conversation history** — Cleared on every clean exit; only persists between sessions in the event of a crash
- **Profile & Settings (Desktop)** — Retained until you click "Clear Data & Users"
- **Profile & Settings (CLI)** — Retained in `config.json` until you uninstall or manually delete the file
- **Exported profiles** — If you export your profile, the resulting JSON file is stored wherever you save it — you are responsible for managing that file

---

## Data We Do NOT Collect

The LlamaTalk suite **does not:**

- Collect any analytics, telemetry, or usage data
- Track your behavior or conversations
- Store data on any remote server
- Include tracking cookies or identifiers
- Phone home to report errors or crashes
- Collect information about your device, OS, or installed software
- Share your data with third parties

---

## Message and Prompt Privacy

### Local Ollama Models (Default)

When you send a message to a local Ollama model:

1. Your message is sent **only to your local Ollama server** (typically running at `http://localhost:11434`)
2. Your message is **not** sent to any cloud AI service
3. Your message is **not** logged, recorded, or shared externally
4. The response from Ollama is received locally and stored in your conversation history

### Cloud AI Providers (Optional)

LlamaTalk Desktop and LlamaTalkCLI both support optional cloud AI providers: **Anthropic (Claude)**, **Google (Gemini)**, and **OpenAI (GPT)**. These are **disabled by default** and must be explicitly enabled and configured with your own API key.

When you send a message to a cloud model:

1. Your message is transmitted to the selected provider's servers over HTTPS
2. The provider's own privacy policy and data handling practices apply to that message
3. LlamaTalk Desktop displays a notice in the chat area identifying which provider will receive your message, and updates that notice when you switch models
4. Your API keys are stored locally — they are **never** sent anywhere except directly to the API endpoint of the provider they belong to
5. API keys are **never** included in exported profile files

You remain in full control of which providers are enabled and can disable them at any time in Settings.

---

## File Operations

### Exporting Profiles and Conversations

- When you export a profile (JSON) or conversation (TXT), the files are saved to your local disk at the location you specify
- LlamaTalk does not automatically upload or transmit these files anywhere
- Exported profiles do **not** contain API keys or your plaintext PIN — only hashed values and non-sensitive settings

### Importing Profiles

- When you import a profile from a file, LlamaTalk validates the JSON structure and merges your data locally
- No data is sent to external servers during import

---

## Security Measures

LlamaTalk takes the following security precautions:

- **PIN Hashing (Desktop)** — Your PIN is hashed with PBKDF2 (100,000 iterations, SHA-256, random 16-byte per-user salt). Plaintext PIN is never stored. Older SHA-256 hashes are migrated automatically on first unlock.
- **PIN Hashing (CLI)** — Your PIN is hashed with PBKDF2 (100,000 iterations, SHA-256, random 16-byte per-user salt). Plaintext PIN is never stored. Legacy hashes from earlier versions are automatically migrated to PBKDF2 on first unlock.
- **Timing-Safe PIN Comparison (CLI)** — PIN verification uses `crypto.timingSafeEqual` to prevent timing side-channel attacks.
- **Security Questions** — Your security question answers are hashed and never stored in plaintext
- **Content Security Policy (Desktop)** — Strict CSP prevents inline scripts and eval()
- **Profile Import Validation** — Imported profiles are validated for type, format, and value constraints before being saved
- **Ollama URL Validation** — The Ollama server URL is validated before every request; non-HTTP/HTTPS schemes and link-local addresses are rejected
- **Request Timeouts** — All network calls have enforced timeouts to prevent indefinite hangs
- **Capability Scoping (Desktop)** — Tauri capabilities limit what file and system operations the app can perform
- **API Key Exclusion from Exports** — Cloud API keys are stripped from all exported files
- **Cancel Propagation (CLI)** — User-initiated request cancellation (Esc key) is propagated through to the underlying network call via AbortController, ensuring no orphaned requests continue after cancellation

---

## Security Reviews

The LlamaTalk suite undergoes periodic internal security and privacy reviews covering:

- Authentication controls (PIN hashing, verification, and migration)
- Input validation across all user-supplied data
- Network security (URL validation, scheme enforcement, request timeouts)
- Dependency auditing for telemetry, analytics, or unexpected network behavior
- Known gaps and their risk classification and roadmap

Review findings are documented internally. No critical vulnerabilities have been identified. Known gaps are tracked with risk ratings and planned remediation paths.

---

## Data You Control

You have full control over your data:

- **Access** — Export your profile and conversations at any time
- **Deletion (Desktop)** — Delete individual conversations via the trash icon, or clear all data via "Clear Data & Users"
- **Deletion (CLI)** — Delete `%APPDATA%\LlamaTalkCLI\config.json` and `history.json` to remove all stored data; or uninstall the application
- **Portability** — Your exported profile JSON can be imported into another LlamaTalk installation on another device

---

## Third-Party Dependencies

### LlamaTalk Desktop

- **React** (UI framework)
- **Tauri** (desktop framework)
- **Vite** (build tool)
- **Ollama API** (local AI integration)

### LlamaTalkCLI

- No runtime dependencies — built on Node.js built-in modules only

None of these libraries collect personal data from your usage of LlamaTalk. All dependencies are reviewed periodically for privacy compliance — see the dependency privacy audit for a complete review.

---

## Updates and Changes

When you update LlamaTalk:

- Your existing profiles, conversations, and settings are preserved
- Update notes in the changelog disclose any changes to how data is handled
- You are not automatically opted into any new data collection or telemetry

---

## Contact & Transparency

Created by **ItsTrag1c**. For questions, visit the project repository.

---

## Legal Compliance

LlamaTalk is designed with privacy-by-default principles consistent with:

- **GDPR** — Right to access (export), right to deletion (clear data), data minimization (no unnecessary collection)
- **CCPA** — Right to know, right to delete, right to opt-out of sale (LlamaTalk doesn't sell data)
- **General Privacy Best Practices** — Transparency, user control, secure storage

---

## Changelog

- **2026-03-02** — Initial privacy policy created. Baseline privacy practices documented.
- **2026-03-03** — Updated to cover LlamaTalkCLI. Corrected PIN hashing details (Desktop upgraded to PBKDF2 in v0.8.0). Added cloud provider privacy section. Added deletion log disclosure. Added export audit trail. Documented CLI session history clearing behavior.
- **2026-03-03 (rev. 2)** — Corrected CLI PIN hashing (upgraded to PBKDF2 in v0.3.6; legacy migration noted). Added Security Reviews section. Added cancel propagation note. Added dependency audit reference in Third-Party Dependencies section.

---

**If you have read and understood this privacy policy, you may proceed with using LlamaTalk.**
