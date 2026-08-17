import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("Entra deployment keeps the secret out of Azure CLI arguments", async () => {
  const script = await readFile(
    path.join(process.cwd(), "scripts", "Deploy-Infrastructure.ps1"),
    "utf8",
  );
  assert.match(script, /readEnvironmentVariable\('\$secretEnvironmentVariable'\)/);
  assert.match(script, /IDEA2IMPACT_ENTRA_SECRET_\$\(\[Guid\]::NewGuid\(\)/);
  assert.match(script, /SetEnvironmentVariable\([\s\S]*EnvironmentVariableTarget\]::Process/);
  assert.match(
    script,
    /SetEnvironmentVariable\(\s*\$secretEnvironmentVariable,\s*\$null,[\s\S]*EnvironmentVariableTarget\]::Process/,
  );
  assert.match(script, /Remove-Item -LiteralPath \$temporaryParameterFile/);
  assert.match(script, /ZeroFreeBSTR\(\$secretPointer\)/);
  assert.match(script, /finally\s*\{[\s\S]*SetEnvironmentVariable[\s\S]*Remove-Item/);
  assert.doesNotMatch(script, /entraClientSecret=\$plainSecret/);
  assert.match(script, /az version --output json --only-show-errors/);
  assert.match(script, /\$azureCliVersionDocument\.'azure-cli'/);
  const argumentSection = script.slice(
    script.indexOf("$deploymentArguments = @("),
    script.indexOf("$outputs = $deploymentJson"),
  );
  assert.doesNotMatch(argumentSection, /entraClientSecret=/);
  assert.doesNotMatch(argumentSection, /Write-(?:Host|Output|Verbose|Debug).*plainSecret/i);
});

test("failed external ingress activation restores private ingress", async () => {
  const script = await readFile(
    path.join(process.cwd(), "scripts", "Deploy-Infrastructure.ps1"),
    "utf8",
  );
  assert.match(script, /function Restore-PrivateIngressAndVerify/);
  assert.match(
    script,
    /containerapp ingress enable[\s\S]*--type internal[\s\S]*--target-port 3000/,
  );
  assert.match(
    script,
    /\$externalIngressEnableAttempted = \$true[\s\S]*containerapp ingress enable/,
  );
  assert.match(
    script,
    /catch\s*\{[\s\S]*\$externalIngressEnableAttempted[\s\S]*Restore-PrivateIngressAndVerify/,
  );
  assert.match(
    script,
    /properties\.configuration\.ingress\.external[\s\S]*ToLowerInvariant\(\) -ne 'false'/,
  );
});
