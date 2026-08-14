import { NextResponse } from "next/server";

const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function isLoopback(hostname: string): boolean {
  return loopbackHosts.has(hostname.toLowerCase());
}

export function rejectNonLocalMutation(request: Request): NextResponse | undefined {
  const requestUrl = new URL(request.url);
  if (!isLoopback(requestUrl.hostname)) {
    return NextResponse.json(
      { error: "Idea2Impact only accepts local requests" },
      { status: 403 },
    );
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (!isLoopback(originUrl.hostname) || originUrl.origin !== requestUrl.origin) {
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

function secretValues(): string[] {
  return [
    process.env.AZURE_SPEECH_KEY,
    process.env.GITHUB_TOKEN,
    process.env.FOUNDRY_PROJECT_ENDPOINT,
  ].filter((value): value is string => Boolean(value && value.length >= 4));
}

export function redactSensitive(value: string): string {
  let redacted = value;
  for (const secret of secretValues()) {
    redacted = redacted.replaceAll(secret, "[REDACTED]");
  }
  return redacted
    .replace(/\b(?:api[-_ ]?key|authorization|token|secret)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/[A-Z]:\\[^\r\n"]+/gi, "[LOCAL_PATH]");
}

export class PublicError extends Error {
  constructor(
    public readonly publicMessage: string,
    public readonly status = 500,
    message = publicMessage,
  ) {
    super(message);
  }
}

export function publicErrorResponse(
  error: unknown,
  fallback: string,
  fallbackStatus = 500,
): NextResponse {
  if (error instanceof PublicError) {
    console.error(`[Idea2Impact] ${redactSensitive(error.message)}`);
    return NextResponse.json(
      { error: error.publicMessage },
      { status: error.status },
    );
  }
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[Idea2Impact] ${redactSensitive(detail)}`);
  return NextResponse.json({ error: fallback }, { status: fallbackStatus });
}
