import { createWriteStream } from "fs";
import { createHash } from "crypto";

const GITHUB_REPO = "ItsTrag1c/Clank-Chat";

const ORANGE = "\x1b[38;5;208m";
const RESET  = "\x1b[0m";

// Parses "1.2.3" or "v1.2.3" → [1, 2, 3] or null
export function parseSemver(v) {
  const clean = typeof v === "string" ? v.replace(/^v/, "") : String(v);
  const parts = clean.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return parts;
}

// Returns true if semver array a is strictly greater than b
export function semverGt(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

// Fetches the latest GitHub release metadata.
// Returns { version, exeUrl, checksumUrl, sizeMB } or null on any error.
export async function fetchLatestRelease() {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "ClankCLI",
      },
    }
  );
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);

  const data = await res.json();
  const tagName = data.tag_name;
  if (!tagName) return null;

  const version = tagName.replace(/^v/, "");
  const assets = data.assets ?? [];

  // The standalone versioned EXE (not the setup installer)
  const exeAsset = assets.find((a) => /^ClankCLI_[\d.]+\.exe$/.test(a.name));
  if (!exeAsset) return null;

  const checksumAsset = assets.find((a) => a.name === "checksums.txt");

  return {
    version,
    exeUrl: exeAsset.browser_download_url,
    checksumUrl: checksumAsset?.browser_download_url ?? "",
    sizeMB: Math.max(1, Math.ceil(exeAsset.size / 1024 / 1024)),
  };
}

// Downloads a file from url to destPath, printing a live progress bar.
// Returns the SHA-256 hex digest of the downloaded bytes.
export async function downloadExe(url, destPath, totalBytes) {
  const res = await fetch(url, {
    headers: { "User-Agent": "ClankCLI" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const total = totalBytes || Number(res.headers.get("content-length")) || 0;
  let received = 0;
  const BAR_WIDTH = 20;
  const hash = createHash("sha256");
  const writeStream = createWriteStream(destPath);
  const reader = res.body.getReader();

  function printProgress() {
    if (total > 0) {
      const pct = Math.min(100, Math.floor((received * 100) / total));
      const filled = Math.floor((pct * BAR_WIDTH) / 100);
      const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
      process.stdout.write(`\r  ${ORANGE}${bar}${RESET}  ${pct}%`);
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      hash.update(value);
      await new Promise((resolve, reject) => {
        writeStream.write(value, (err) => (err ? reject(err) : resolve()));
      });
      printProgress();
    }
    process.stdout.write("\n");
    await new Promise((resolve, reject) => {
      writeStream.end((err) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    writeStream.destroy();
    throw err;
  }

  return hash.digest("hex");
}
