import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const check = spawnSync(process.execPath, [path.join(root, "scripts/check.mjs")], { stdio: "inherit" });
if (check.status !== 0) process.exit(check.status ?? 1);
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const dist = path.join(root, "dist");
const target = path.join(dist, "SelectSpeak");
await mkdir(dist, { recursive: true });
await rm(target, { recursive: true, force: true });
await mkdir(target);
for (const file of ["manifest.json", "popup.html", "practice.html", "src", "icons", "data", "README.md", "PRIVACY.md", "THIRD_PARTY_NOTICES.md", "VERIFICATION.md"]) {
  await cp(path.join(root, file), path.join(target, file), { recursive: true });
}
const archive = `SelectSpeak-${manifest.version}.zip`;
await rm(path.join(dist, archive), { force: true });
const zip = spawnSync("zip", ["-q", "-r", path.join(dist, archive), "."], { cwd: target, stdio: "inherit" });
if (zip.status !== 0) process.exit(zip.status ?? 1);
console.log(`Ready to load: ${target}`);
console.log(`Archive: ${path.join(dist, archive)}`);
