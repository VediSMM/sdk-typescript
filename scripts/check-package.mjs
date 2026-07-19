import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packed = spawnSync("npm", ["pack", "--json", "--dry-run", "--ignore-scripts"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, npm_config_cache: resolve(root, ".npm-cache") },
});
if (packed.status !== 0) throw new Error(packed.stderr || "npm pack failed");
const report = JSON.parse(packed.stdout)[0];
const files = report.files.map((item) => item.path);
for (const required of ["package.json", "dist/src/index.js", "dist/src/index.d.ts", "README.md", "LICENSE"]) {
  if (!files.includes(required)) throw new Error(`package is missing ${required}`);
}
for (const file of files) {
  if (/^(?:test|contract|scripts|examples|node_modules)\//.test(file) || /(?:^|\/)\.env(?:\.|$)/.test(file)) {
    throw new Error(`private development file would be packed: ${file}`);
  }
}
