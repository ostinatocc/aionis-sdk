#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const command = process.argv[2] ?? "check";

function usage() {
  console.error("Usage: node scripts/runtime-source.mjs <check|sync> [--runtime-repo <path>]");
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function realpathOrSelf(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return value;
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

if (command !== "check" && command !== "sync") {
  usage();
  process.exit(2);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sdkRoot = path.resolve(scriptDir, "..");
const sdkRoots = unique([sdkRoot, realpathOrSelf(sdkRoot)]);
const explicitRuntimeRepo = argValue("--runtime-repo") ?? process.env.AIONIS_RUNTIME_REPO;
const runtimeRepoCandidates = explicitRuntimeRepo
  ? [path.resolve(explicitRuntimeRepo)]
  : sdkRoots.flatMap((root) => [
      path.resolve(root, "../AionisRuntime-focused"),
      path.resolve(root, "../../AionisRuntime-focused"),
      path.resolve(root, "../new.aionis/AionisRuntime-focused"),
    ]);
const runtimeRepo = runtimeRepoCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, "scripts", "sdk-source.mjs"))
  && fs.existsSync(path.join(candidate, "src", "sdk.ts")));

if (!runtimeRepo) {
  console.error("Could not find Aionis Runtime repository with the authoritative SDK sync tool.");
  console.error("Set AIONIS_RUNTIME_REPO=/absolute/path/to/AionisRuntime-focused or pass --runtime-repo <path>.");
  process.exit(1);
}

const syncTool = path.join(runtimeRepo, "scripts", "sdk-source.mjs");
const delegated = spawnSync(process.execPath, [syncTool, command, "--sdk-repo", sdkRoot], {
  cwd: runtimeRepo,
  stdio: "inherit",
  env: process.env,
});
if (delegated.error) {
  console.error(`Failed to run Runtime SDK sync tool: ${delegated.error.message}`);
  process.exit(1);
}
process.exit(delegated.status ?? 1);
