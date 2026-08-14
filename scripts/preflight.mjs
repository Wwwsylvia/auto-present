import { spawnSync } from "node:child_process";

const commands = [
  ["node", ["--version"]],
  ["ffmpeg", ["-version"]],
  ["ffprobe", ["-version"]],
  [
    process.platform === "win32" ? "az.cmd" : "az",
    ["account", "show", "--query", "{name:name,user:user.name}", "-o", "json"],
  ],
];
let failed = false;
for (const [command, args] of commands) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`FAIL ${command}: ${result.error?.message ?? result.stderr.trim()}`);
    failed = true;
  } else {
    console.log(`PASS ${command}`);
  }
}
for (const variable of [
  "FOUNDRY_PROJECT_ENDPOINT",
  "FOUNDRY_MODEL_DEPLOYMENT",
  "AZURE_SPEECH_REGION",
]) {
  console.log(`${process.env[variable] ? "PASS" : "WARN"} ${variable}`);
}
if (failed) process.exit(1);
