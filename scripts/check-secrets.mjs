import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const listed = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
if (listed.status !== 0) throw new Error("git ls-files failed");
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[opusr]_[A-Za-z0-9]{36,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /Bearer\s+(?!attacker\b|secret-token\b|top-secret\b|token\b)[A-Za-z0-9._~+\/-]{24,}/,
];
for (const file of listed.stdout.split("\0").filter(Boolean)) {
  const content = await readFile(resolve(root, file), "utf8").catch(() => "");
  for (const pattern of patterns) {
    if (pattern.test(content)) throw new Error(`possible secret in ${file}`);
  }
}
