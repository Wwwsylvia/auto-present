import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("local launcher rejects non-loopback listeners before reuse", async () => {
  const script = await readFile(
    path.join(process.cwd(), "scripts", "Start-Local.ps1"),
    "utf8",
  );
  assert.match(script, /IPAddress\]::IsLoopback/);
  assert.match(script, /non-loopback listener/);
  assert.doesNotMatch(script, /Get-NetTCPConnection[\s\S]{0,120}Select-Object -First 1/);
  assert.match(script, /Get-HealthMismatches/);
  assert.match(script, /configurationFingerprint/);
  assert.match(script, /data directory/);
  assert.match(script, /service mode/);
  assert.match(script, /server mode/);
  assert.match(script, /process \$processIds was not stopped/);
  assert.doesNotMatch(script, /Stop-Process/);
});
