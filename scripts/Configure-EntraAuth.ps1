throw @'
Post-deployment authentication configuration is intentionally disabled.

Create the Microsoft Entra app registration first, then pass its tenant ID,
client ID, and SecureString client secret to Deploy-Infrastructure.ps1 together
with -EnableExternalIngress. The Bicep deployment provisions ingress and
Container Apps built-in authentication together and fails if any authentication
parameter is missing.
'@
