import { readdir, readFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
assert.equal(manifest.manifest_version, 3);
const references = [manifest.background.service_worker, manifest.action.default_popup,
  ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon),
  ...manifest.content_scripts.flatMap((script) => script.js)];
for (const reference of references) await access(path.join(root, reference));
for (const file of await readdir(path.join(root, "src"))) {
  if (!file.endsWith(".js")) continue;
  const result = spawnSync(process.execPath, ["--check", path.join(root, "src", file)], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}
let count = 0;
for (const file of await readdir(path.join(root, "data/dictionary"))) {
  const shard = JSON.parse(await readFile(path.join(root, "data/dictionary", file), "utf8"));
  count += Object.keys(shard).length;
}
const metadata = JSON.parse(await readFile(path.join(root, "data/dictionary-meta.json"), "utf8"));
assert.equal(count, metadata.total);
await access(path.join(root, "data/ECDICT-LICENSE.txt"));
console.log(`Manifest, icons, JavaScript and ${count.toLocaleString()} dictionary entries verified.`);
