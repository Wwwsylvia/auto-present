import { NextResponse } from "next/server";

const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function isLoopback(hostname: string): boolean {
  return loopbackHosts.has(hostname.toLowerCase());
}

function effectivePort(url: URL): string {
  if (url.port) return url.port;
  if (url.protocol === "http:") return "80";
  if (url.protocol === "https:") return "443";
  return "";
}

function isEquivalentLoopbackOrigin(left: URL, right: URL): boolean {
  return (
    isLoopback(left.hostname) &&
    isLoopback(right.hostname) &&
    left.protocol === right.protocol &&
    effectivePort(left) === effectivePort(right)
  );
}

export function rejectUnsafeRequest(request: Request): NextResponse | undefined {
  if (process.env.APP_HOSTING_MODE === "azure") return undefined;

  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  let hostUrl: URL | undefined;
  try {
    hostUrl = host ? new URL(`${requestUrl.protocol}//${host}`) : undefined;
  } catch {
    hostUrl = undefined;
  }
  if (
    !hostUrl ||
    hostUrl.username ||
    hostUrl.password ||
    hostUrl.pathname !== "/" ||
    hostUrl.search ||
    hostUrl.hash ||
    !isEquivalentLoopbackOrigin(hostUrl, requestUrl)
  ) {
    return NextResponse.json(
      { error: "Idea2Impact only accepts local requests in localhost mode" },
      { status: 403 },
    );
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (
        originUrl.username ||
        originUrl.password ||
        originUrl.pathname !== "/" ||
        originUrl.search ||
        originUrl.hash ||
        !isEquivalentLoopbackOrigin(originUrl, hostUrl)
      ) {
        return NextResponse.json(
          { error: "Cross-origin requests are not allowed" },
          { status: 403 },
        );
      }
    } catch {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
    }
  }

  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json(
      { error: "Cross-site requests are not allowed" },
      { status: 403 },
    );
  }
}

export function publicErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  const secrets = [
    process.env.AZURE_SPEECH_KEY,
    process.env.GITHUB_TOKEN,
    process.env.FOUNDRY_PROJECT_ENDPOINT,
  ].filter((value): value is string => Boolean(value && value.length >= 4));
  return secrets.reduce(
    (redacted, secret) => redacted.replaceAll(secret, "[REDACTED]"),
    message,
  );
}
