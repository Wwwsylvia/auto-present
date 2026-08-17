import assert from "node:assert/strict";
import test from "node:test";
import { rejectUnsafeRequest } from "@/lib/http";

test("localhost mode accepts loopback same-origin requests", () => {
  const request = new Request("http://127.0.0.1:3000/api/projects", {
    headers: {
      Host: "127.0.0.1:3000",
      Origin: "http://127.0.0.1:3000",
    },
  });
  assert.equal(rejectUnsafeRequest(request), undefined);
});

test("localhost mode accepts equivalent loopback hostname aliases", () => {
  for (const request of [
    new Request("http://localhost:3000/api/projects", {
      headers: {
        Host: "127.0.0.1:3000",
        Origin: "http://127.0.0.1:3000",
      },
    }),
    new Request("http://127.0.0.1:3000/api/projects", {
      headers: {
        Host: "localhost:3000",
        Origin: "http://localhost:3000",
      },
    }),
    new Request("http://[::1]:3000/api/projects", {
      headers: {
        Host: "127.0.0.1:3000",
        Origin: "http://localhost:3000",
      },
    }),
    new Request("http://localhost/api/projects", {
      headers: {
        Host: "127.0.0.1:80",
        Origin: "http://[::1]",
      },
    }),
  ]) {
    assert.equal(rejectUnsafeRequest(request), undefined);
  }
});

test("localhost mode rejects loopback aliases with different ports or protocols", () => {
  for (const request of [
    new Request("http://localhost:3000/api/projects", {
      headers: {
        Host: "127.0.0.1:3001",
        Origin: "http://127.0.0.1:3001",
      },
    }),
    new Request("http://127.0.0.1:3000/api/projects", {
      headers: {
        Host: "localhost:3000",
        Origin: "http://localhost:3001",
      },
    }),
    new Request("http://127.0.0.1:3000/api/projects", {
      headers: {
        Host: "localhost:3000",
        Origin: "https://localhost:3000",
      },
    }),
  ]) {
    assert.equal(rejectUnsafeRequest(request)?.status, 403);
  }
});

test("localhost mode rejects non-loopback, forged Host, and cross-origin requests", () => {
  for (const request of [
    new Request("http://192.168.1.10:3000/api/projects", {
      headers: { Host: "192.168.1.10:3000" },
    }),
    new Request("http://127.0.0.1:3000/api/projects", {
      headers: { Host: "attacker.example:3000" },
    }),
    new Request("http://127.0.0.1:3000/api/projects", {
      headers: {
        Host: "127.0.0.1:3000",
        Origin: "https://example.com",
      },
    }),
    new Request("http://127.0.0.1:3000/api/projects", {
      headers: { Host: "0.0.0.0:3000" },
    }),
    new Request("http://127.0.0.1:3000/api/projects", {
      headers: { Host: "localhost:3000/path" },
    }),
    new Request("http://127.0.0.1:3000/api/projects", {
      headers: {
        Host: "localhost:3000",
        "Sec-Fetch-Site": "cross-site",
      },
    }),
    new Request("http://127.0.0.1:3000/api/projects", {
      headers: {
        Host: "localhost:3000",
        Origin: "http://localhost:3000/path",
      },
    }),
  ]) {
    assert.equal(rejectUnsafeRequest(request)?.status, 403);
  }
});

test("azure mode delegates request authentication to Container Apps auth", () => {
  const previous = process.env.APP_HOSTING_MODE;
  process.env.APP_HOSTING_MODE = "azure";
  try {
    const request = new Request("https://app.example/api/projects", {
      headers: { Host: "app.example" },
    });
    assert.equal(rejectUnsafeRequest(request), undefined);
  } finally {
    if (previous === undefined) delete process.env.APP_HOSTING_MODE;
    else process.env.APP_HOSTING_MODE = previous;
  }
});
