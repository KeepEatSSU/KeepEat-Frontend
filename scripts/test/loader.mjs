// Module resolution hooks so plain `node --test` can load the app's real
// service modules:
//   - `@/x` path alias (tsconfig paths) -> <repo>/x with TS extension probing
//   - `expo-secure-store` -> in-memory stub (the real one needs native modules)
//
// Node strips the TypeScript types itself, so services/*.ts loads as-is and the
// harness exercises the shipping code rather than a copy of it.

import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const SECURE_STORE_STUB = pathToFileURL(
  path.join(HERE, "stubs", "expo-secure-store.mjs"),
).href;

const EXTENSIONS = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "expo-secure-store") {
    return { url: SECURE_STORE_STUB, shortCircuit: true };
  }

  if (specifier.startsWith("@/")) {
    const base = path.join(ROOT, specifier.slice(2));
    for (const ext of EXTENSIONS) {
      if (existsSync(base + ext)) {
        return { url: pathToFileURL(base + ext).href, shortCircuit: true };
      }
    }
  }

  return nextResolve(specifier, context);
}
