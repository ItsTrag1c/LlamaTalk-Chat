import { execSync } from "child_process";
import { readFileSync } from "fs";

const { version } = JSON.parse(readFileSync("./package.json", "utf8"));
const out = `dist/ClankCLI_${version}.exe`;

console.log(`Building ClankCLI v${version}...`);
execSync(`pkg dist/bundle.cjs --target node18-win-x64 --output "${out}" --icon icons/cli-icon.ico`, { stdio: "inherit" });

console.log(`Built: ${out}`);

console.log("");
execSync("node scripts/build-installer.js", { stdio: "inherit" });
