import test from "node:test";
import assert from "node:assert/strict";
import worker, { proxy } from "../worker/proxy.js";
const origin = "https://date-invitation.makszagar001.workers.dev";

test("proxy only serves public assets and the fixed response endpoint", async () => {
  let calls = 0;
  const upstream = async (url, init) => {
    calls++;
    assert.equal(url.origin, "https://date-invitation-7yx.pages.dev");
    assert.equal(init.headers.get("cookie"), null);
    return new Response("asset");
  };
  assert.equal((await proxy(new Request(origin + "/script.js?v=1", { headers: { Cookie: "private" } }), upstream)).status, 200);
  for (const path of ["/.dev.vars", "/functions/api/respond.js", "/other"]) {
    assert.equal((await proxy(new Request(origin + path), upstream)).status, 404);
  }
  assert.equal((await proxy(new Request(origin + "/api/respond"), upstream)).status, 405);
  assert.equal((await proxy(new Request(origin + "/api/respond", { method: "POST", headers: { Origin: "https://evil.example" } }), upstream)).status, 403);
  assert.equal(calls, 1);
});

test("proxy preserves visitor origin for server verification and hides redirects", async () => {
  const request = new Request(origin + "/api/respond", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{}" });
  const response = await proxy(request, async (url, init) => {
    assert.equal(init.headers.get("origin"), origin);
    assert.equal(init.method, "POST");
    return Response.json({ ok: true });
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal((await proxy(new Request(origin), async () => Response.redirect("https://date-invitation-7yx.pages.dev"))).status, 502);
  assert.equal((await proxy(new Request(origin), async () => { throw new Error("private"); })).status, 503);
  // The platform passes env as the second handler argument, never as fetchImpl.
  assert.equal((await worker.fetch(new Request("https://evil.example"), {})).status, 404);
});
