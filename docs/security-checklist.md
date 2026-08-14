# Local security checklist

- [x] Web startup binds explicitly to `127.0.0.1`.
- [x] State-changing APIs reject non-loopback and cross-origin requests.
- [x] Foundry and Speech credentials are used only in server or worker code.
- [x] Azure CLI-backed `DefaultAzureCredential` is the default authentication path.
- [x] Subscription keys are optional fallback configuration and are never browser variables.
- [x] Public repository excerpts are bounded, treated as untrusted evidence, and excluded from system instructions.
- [x] Model generation and contextual patches are schema validated before persistence.
- [x] Evidence paths and contextual revision slide IDs must refer to supplied data.
- [x] Uploads are size and MIME bounded, written temporarily, and validated with `ffprobe` before promotion.
- [x] Browser errors and worker status redact credentials, endpoints, and local filesystem paths.
- [x] Render downloads are local API responses available only for completed durable jobs.
- [x] Replaced uploads, stale renders, failed partial renders, and temporary upload files are removed.

## Required least-privilege access

Sign in locally with `az login`. Grant that identity access only to the Foundry project/model used by this application and the **Cognitive Services Speech User** role on the selected Speech resource. Do not use owner or contributor roles merely to run inference.

## Local retention and erasure

Active project metadata and current upload/render artifacts remain in `IDEA2IMPACT_DATA_DIR` (or `.data` by default). Replaced uploads, obsolete render output, failed partial output, and temporary files are removed automatically. To erase all local Idea2Impact data, stop the web and worker processes and delete that one configured data directory.
