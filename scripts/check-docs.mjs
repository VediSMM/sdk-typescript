import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "README.md",
  "README.ru.md",
  "docs/en/guide.md",
  "docs/ru/guide.md",
  "examples/quickstart.ts",
  "CHANGELOG.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "LICENSE",
];
for (const file of required) await access(resolve(root, file));

const topics = ["authentication", "errors", "pagination", "idempotency", "etag", "media", "jobs", "webhooks"];
for (const file of ["docs/en/guide.md", "docs/ru/guide.md"]) {
  const content = (await readFile(resolve(root, file), "utf8")).toLowerCase();
  for (const topic of topics) {
    if (!content.includes(topic)) throw new Error(`${file} does not cover ${topic}`);
  }
}
