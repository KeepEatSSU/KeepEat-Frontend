// Module resolution hooks so plain `node --test` can load the app's real
// service modules:
//   - `@/x` path alias (tsconfig paths) -> <repo>/x with TS extension probing
//   - native-backed packages -> in-memory stubs (the real ones need the RN
//     bridge); see the STUBS map
//
// Node strips the TypeScript types itself, so services/*.ts loads as-is and the
// harness exercises the shipping code rather than a copy of it.

import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

function stubUrl(name) {
  return pathToFileURL(path.join(HERE, "stubs", name)).href;
}

const STUBS = new Map([
  ["expo-secure-store", stubUrl("expo-secure-store.mjs")],
  ["@react-native-async-storage/async-storage", stubUrl("async-storage.mjs")],
  ["expo-notifications", stubUrl("expo-notifications.mjs")],
  ["expo-constants", stubUrl("expo-constants.mjs")],
  ["react-native", stubUrl("react-native.mjs")],
]);

const EXTENSIONS = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, nextResolve) {
  const stub = STUBS.get(specifier);
  if (stub) {
    return { url: stub, shortCircuit: true };
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
