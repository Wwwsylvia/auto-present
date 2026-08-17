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
