#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
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
const runtimeRepo = runtimeRepoCandidates.find((candidate) => fs.existsSync(path.join(candidate, "src", "sdk.ts")));

if (command !== "check" && command !== "sync") {
  usage();
  process.exit(2);
}

if (!runtimeRepo) {
  console.error("Could not find Aionis Runtime repository.");
  console.error("Set AIONIS_RUNTIME_REPO=/absolute/path/to/AionisRuntime-focused or pass --runtime-repo <path>.");
  process.exit(1);
}

const sourceFile = path.join(runtimeRepo, "src", "sdk.ts");
const targetFile = path.join(sdkRoot, "src", "index.ts");
const source = fs.readFileSync(sourceFile, "utf8");
const target = fs.existsSync(targetFile) ? fs.readFileSync(targetFile, "utf8") : "";

if (command === "sync") {
  if (source !== target) {
    fs.writeFileSync(targetFile, source);
    console.log(`Synced ${sourceFile} -> ${targetFile}`);
  } else {
    console.log(`SDK source already in sync: ${targetFile}`);
  }
  process.exit(0);
}

if (source !== target) {
  console.error("Standalone @aionis/sdk source is out of sync with Runtime src/sdk.ts.");
  console.error(`Runtime source: ${sourceFile}`);
  console.error(`SDK target:     ${targetFile}`);
  console.error("Run: npm run source:sync");
  process.exit(1);
}

console.log(`SDK source check passed: ${targetFile}`);
