import { execSync } from "child_process";
import { readFileSync } from "fs";

const { version } = JSON.parse(readFileSync("./package.json", "utf8"));
const out = `dist/LlamaTalkCLI_${version}.exe`;

console.log("Generating CLI icon...");
execSync("node scripts/make-cli-icon.js", { stdio: "inherit" });

console.log(`Building LlamaTalkCLI v${version}...`);
execSync(`pkg dist/bundle.cjs --target node18-win-x64 --output "${out}" --icon icons/cli-icon.ico`, { stdio: "inherit" });

console.log(`Built: ${out}`);

console.log("");
execSync("node scripts/build-installer.js", { stdio: "inherit" });
