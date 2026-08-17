throw @'
Post-deployment authentication configuration is intentionally disabled.

Create the Microsoft Entra app registration first, then pass its tenant ID,
client ID, SecureString client secret, and at least one allowed user or group
object ID to Deploy-Infrastructure.ps1 together with -EnableExternalIngress.
The Bicep deployment provisions ingress, authentication, and authorization
together and fails if any required parameter is missing.
'@
