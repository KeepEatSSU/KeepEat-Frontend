import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const target = process.argv[2];
const apiVariableByTarget = {
  local: "EXPO_PUBLIC_API_URL_LOCAL",
  demo: "EXPO_PUBLIC_API_URL_DEMO",
};
const apiVariable = apiVariableByTarget[target];
const envFile = ".env";

if (!apiVariable) {
  console.error("Usage: node scripts/start-variant.mjs <local|demo>");
  process.exit(1);
}

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const envPath = path.join(projectRoot, envFile);

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const apiUrl = process.env[apiVariable]?.trim();
if (!apiUrl) {
  console.error(
    `[start:${target}] ${apiVariable} is missing. Add it to ${envFile} (see .env.example).`,
  );
  process.exit(1);
}

const expoBinary = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "expo.cmd" : "expo",
);
const child = spawn(expoBinary, ["start", ...process.argv.slice(3)], {
  cwd: projectRoot,
  env: {
    ...process.env,
    APP_ENV: target,
    EXPO_PUBLIC_API_URL: apiUrl,
  },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`[start:${target}] Failed to start Expo:`, error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
