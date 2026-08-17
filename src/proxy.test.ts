import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

test("proxy protects localhost pages and RSC requests", () => {
  const previous = process.env.APP_HOSTING_MODE;
  process.env.APP_HOSTING_MODE = "local";
  try {
    const valid = proxy(
      new NextRequest("http://127.0.0.1:3000/projects/project-id", {
        headers: { host: "127.0.0.1:3000", rsc: "1" },
      }),
    );
    assert.equal(valid.status, 200);

    const forged = proxy(
      new NextRequest("http://127.0.0.1:3000/projects/project-id", {
        headers: { host: "example.com", rsc: "1" },
      }),
    );
    assert.equal(forged.status, 403);
  } finally {
    if (previous === undefined) delete process.env.APP_HOSTING_MODE;
    else process.env.APP_HOSTING_MODE = previous;
  }
});
