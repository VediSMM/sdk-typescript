import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "contract/sdk-operations.json");
const outputPath = resolve(root, "src/operations.ts");
const check = process.argv.includes("--check");

const manifest = JSON.parse(await readFile(sourcePath, "utf8"));
if (manifest.schema_version !== "1.0.0" || manifest.operation_count !== 83) {
  throw new Error("unsupported SDK operation manifest");
}

const operations = [...manifest.operations].sort((left, right) =>
  left.operation_id.localeCompare(right.operation_id),
);

const lines = [
  "// Generated from contract/sdk-operations.json by scripts/sync-operations.mjs.",
  "// The transport and public service API remain hand-written.",
  "",
  "export interface OperationDefinition {",
  '  readonly method: "delete" | "get" | "patch" | "post" | "put";',
  "  readonly path: string;",
  "  readonly tag: string;",
  "  readonly authenticated: boolean;",
  "  readonly scopes: readonly string[];",
  "  readonly requestContentTypes: readonly string[];",
  "  readonly responseStatuses: readonly string[];",
  "  readonly capabilities: readonly string[];",
  "}",
  "",
  "export const OPERATIONS = {",
];

for (const operation of operations) {
  if (operation.path.startsWith("/admin")) {
    throw new Error(`administrative operation rejected: ${operation.operation_id}`);
  }
  lines.push(`  ${JSON.stringify(operation.operation_id)}: {`);
  lines.push(`    method: ${JSON.stringify(operation.method)},`);
  lines.push(`    path: ${JSON.stringify(operation.path)},`);
  lines.push(`    tag: ${JSON.stringify(operation.tag)},`);
  lines.push(`    authenticated: ${JSON.stringify(operation.authenticated)},`);
  lines.push(`    scopes: ${JSON.stringify(operation.scopes)},`);
  lines.push(`    requestContentTypes: ${JSON.stringify(operation.request_content_types)},`);
  lines.push(`    responseStatuses: ${JSON.stringify(operation.response_statuses)},`);
  lines.push(`    capabilities: ${JSON.stringify(operation.capabilities)},`);
  lines.push("  },");
}

lines.push("} as const satisfies Readonly<Record<string, OperationDefinition>>;");
lines.push("");
const next = `${lines.join("\n")}\n`;

if (check) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== next) {
    throw new Error("src/operations.ts is stale; run npm run operations:sync");
  }
} else {
  const temporary = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporary, next, { encoding: "utf8", mode: 0o644 });
  try {
    await rename(temporary, outputPath);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
