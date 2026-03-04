import { execSync } from "child_process";
import { readFileSync } from "fs";
import { rcedit } from "rcedit";

const { version } = JSON.parse(readFileSync("./package.json", "utf8"));
const out = `dist/LlamaTalkCLI_${version}.exe`;

console.log("Generating CLI icon...");
execSync("node scripts/make-cli-icon.js", { stdio: "inherit" });

console.log(`Building LlamaTalkCLI v${version}...`);
execSync(`pkg dist/bundle.cjs --target node18-win-x64 --output "${out}" --icon icons/cli-icon.ico`, { stdio: "inherit" });

console.log(`Stamping version metadata...`);
await rcedit(out, {
  "file-version": version,
  "product-version": version,
  "version-string": {
    ProductName: "LlamaTalk CLI",
    FileDescription: "LlamaTalk CLI",
    CompanyName: "ItsTrag1c",
    LegalCopyright: "MIT",
    OriginalFilename: `LlamaTalkCLI_${version}.exe`,
  },
});
console.log(`Built: ${out}`);

console.log("");
execSync("node scripts/build-installer.js", { stdio: "inherit" });
