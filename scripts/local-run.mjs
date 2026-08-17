import { spawn } from "node:child_process";

const mode = process.argv[2] === "start" ? "start" : "dev";
const windows = process.platform === "win32";
const command = windows ? process.env.ComSpec : "npm";
function commandArguments(script) {
  return windows
    ? ["/d", "/s", "/c", `npm run ${script}`]
    : ["run", script];
}

const children = [
  spawn(command, commandArguments(mode === "start" ? "start:web" : "dev:web"), {
    stdio: "inherit",
    windowsHide: true,
  }),
  spawn(command, commandArguments("worker"), {
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
