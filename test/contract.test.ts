import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { OPERATIONS } from "../src/operations.js";

interface ManifestOperation {
  readonly operation_id: string;
}

interface Manifest {
  readonly operation_count: number;
  readonly operations: readonly ManifestOperation[];
}

const manifest = JSON.parse(
  readFileSync(new URL("../../contract/sdk-operations.json", import.meta.url), "utf8"),
) as Manifest;

test("publishes every canonical operation and no admin operation", () => {
  assert.equal(manifest.operation_count, 83);
  assert.equal(Object.keys(OPERATIONS).length, 83);
  assert.deepEqual(
    Object.keys(OPERATIONS).sort(),
    manifest.operations.map((item) => item.operation_id).sort(),
  );
  assert.equal(
    Object.values(OPERATIONS).some((item) => item.path.startsWith("/admin")),
    false,
  );
});
