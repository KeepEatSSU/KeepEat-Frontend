// Preloaded via `node --import` before any test file. Installs the resolution
// hooks and the two globals the app expects from the Metro/RN runtime.

import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// constants/config.ts throws at import time without this.
process.env.EXPO_PUBLIC_API_URL ??= "http://api.test.local";

// Metro defines __DEV__; individual tests flip it when they assert on logging.
globalThis.__DEV__ = false;

register(pathToFileURL(path.join(HERE, "loader.mjs")));
