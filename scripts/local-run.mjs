import { spawn } from "node:child_process";

const mode = process.argv[2] === "start" ? "start" : "dev";
const webArguments = [
  "node_modules/next/dist/bin/next",
  mode,
  "--hostname",
  "127.0.0.1",
];
const workerArguments = [
  "--env-file-if-exists=.env.local",
  "--import",
  "tsx",
  "src/worker/render-worker.ts",
];

const children = [
  spawn(process.execPath, webArguments, {
    stdio: "inherit",
    windowsHide: true,
  }),
  spawn(process.execPath, workerArguments, {
    stdio: "inherit",
    windowsHide: true,
  }),
];
let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(exitCode), 250).unref();
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (!stopping) stop(code ?? (signal ? 1 : 0));
  });
  child.on("error", () => stop(1));
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
